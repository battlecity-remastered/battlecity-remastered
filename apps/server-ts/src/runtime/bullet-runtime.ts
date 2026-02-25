import {
    normalizeHeading32,
    stepBulletAndResolve,
    type BulletStepResult,
    type BulletState,
    type CombatBuildingState,
    type CombatHazardState
} from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "./emitter.js";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeState
} from "./types.js";
import { asCombatPlayers, removePlayer } from "./player-runtime.js";
import { emitPlayersSnapshot } from "./snapshot.js";
import { restoreFactoryStock } from "../domain/factories/FactoryService.js";
import { detonateActiveBombsOwnedBy } from "../domain/hazards/HazardService.js";

const PLAYER_SPRITE_HALF = 24;
const MAX_CLIENT_SHOT_OFFSET = 96;
const BULLET_TYPE_LASER = 0;
const BULLET_TYPE_ROCKET = 1;
const BULLET_TYPE_FLARE = 3;
const ITEM_TYPE_ROCKET = 1;
const ITEM_TYPE_FLARE = 6;
const ITEM_TYPE_LASER = 12;

const resolveRequiredItemTypeForBullet = (bulletType: number): number | null => {
    if (bulletType === BULLET_TYPE_LASER) {
        return ITEM_TYPE_LASER;
    }
    if (bulletType === BULLET_TYPE_ROCKET) {
        return ITEM_TYPE_ROCKET;
    }
    if (bulletType === BULLET_TYPE_FLARE) {
        return ITEM_TYPE_FLARE;
    }
    return null;
};

const hasRequiredInventoryForBullet = (
    state: RuntimeState,
    socketId: string,
    bulletType: number
): boolean => {
    const requiredItemType = resolveRequiredItemTypeForBullet(bulletType);
    if (requiredItemType === null) {
        return true;
    }
    const inventory = state.playerInventory.get(socketId);
    const count = inventory?.get(requiredItemType) ?? 0;
    return count > 0;
};

const resolveSpawnFromPlayer = (
    playerX: number,
    playerY: number,
    requested: KnownEventPayloadByType["bullet.fire.request"]["position"]
): { x: number; y: number } => {
    const centerX = playerX + PLAYER_SPRITE_HALF;
    const centerY = playerY + PLAYER_SPRITE_HALF;
    const requestedX = requested?.x;
    const requestedY = requested?.y;

    if (Number.isFinite(requestedX) && Number.isFinite(requestedY)) {
        const distance = Math.hypot(requestedX - centerX, requestedY - centerY);
        if (distance <= MAX_CLIENT_SHOT_OFFSET) {
            return {
                x: requestedX,
                y: requestedY
            };
        }
    }

    return {
        x: centerX,
        y: centerY
    };
};

export const createBulletFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["bullet.fire.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<BulletState> => {
    const player = state.players.get(socketId);
    if (!player) {
        return rejectResult("player_not_joined");
    }
    const bulletType = Number.isFinite(payload.type) ? Math.floor(payload.type) : BULLET_TYPE_LASER;
    if (!hasRequiredInventoryForBullet(state, socketId, bulletType)) {
        return rejectResult("inventory_empty");
    }
    const spawn = resolveSpawnFromPlayer(player.x, player.y, payload.position);

    const bullet: BulletState = {
        id: `bullet_${nextSeq()}`,
        ownerId: socketId,
        city: player.city,
        x: spawn.x,
        y: spawn.y,
        direction: normalizeHeading32(payload.direction),
        speed: config.bulletSpeed,
        type: bulletType
    };

    state.bullets.set(bullet.id, bullet);
    return okResult(bullet);
};

type TickContext = {
    state: RuntimeState;
    emitter: RuntimeEmitter;
};

const handleOutOfBounds = (emitter: RuntimeEmitter, bulletId: string): void => {
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "out_of_bounds"
    });
};

const handleTerrainHit = (emitter: RuntimeEmitter, bulletId: string): void => {
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_terrain"
    });
};

const handlePlayerHit = (
    context: TickContext,
    bullet: BulletState,
    bulletId: string,
    result: Extract<BulletStepResult, { kind: "hit_player" }>
): boolean => {
    const { state, emitter } = context;
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_player",
        hitPlayerId: result.playerId
    });

    const player = state.players.get(result.playerId);
    if (!player) {
        return false;
    }

    const nextHealth = result.nextHealth;
    state.players.set(result.playerId, {
        ...player,
        health: nextHealth
    });

    emitter.emit("player.health", {
        id: result.playerId,
        health: nextHealth,
        maxHealth: player.maxHealth,
        source: "bullet"
    });

    if (!result.isDead) {
        return false;
    }

    emitter.emit("player.dead", {
        id: result.playerId,
        by: bullet.ownerId
    });
    const removedBulletIds = removePlayer(state, result.playerId);
    for (const ownedBulletId of removedBulletIds) {
        handleOutOfBounds(emitter, ownedBulletId);
    }
    detonateActiveBombsOwnedBy(state, emitter, result.playerId);
    return true;
};

const handleBuildingHit = (
    context: TickContext,
    bulletId: string,
    result: Extract<BulletStepResult, { kind: "hit_building" }>
): void => {
    const { state, emitter } = context;
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_building",
        hitBuildingId: result.buildingId
    });

    const building = state.buildings.get(result.buildingId);
    if (building) {
        if (result.isDemolished) {
            state.buildings.delete(building.id);
            emitter.emit("building.demolished", {
                id: building.id,
                cityId: building.cityId
            });
            return;
        }

        state.buildings.set(building.id, {
            ...building,
            health: result.nextHealth
        });
        return;
    }

    const defense = state.defenses.get(result.buildingId);
    if (!defense) {
        return;
    }

    if (result.isDemolished) {
        state.defenses.delete(defense.id);
        emitter.emit("defense.remove", {
            id: defense.id,
            reason: "destroyed"
        });
        emitter.emit("factory.stock", restoreFactoryStock(state, defense.cityId, defense.type));
        return;
    }

    state.defenses.set(defense.id, {
        ...defense,
        health: result.nextHealth
    });
    emitter.emit("defense.update", {
        id: defense.id,
        health: result.nextHealth,
        maxHealth: defense.maxHealth
    });
};

const handleHazardHit = (
    context: TickContext,
    bulletId: string,
    result: Extract<BulletStepResult, { kind: "hit_hazard" }>
): void => {
    const { state, emitter } = context;
    emitter.emit("bullet.resolved", {
        id: bulletId,
        reason: "hit_hazard",
        hitHazardId: result.hazardId
    });

    const hazard = state.hazards.get(result.hazardId);
    if (!hazard) {
        return;
    }

    state.hazards.delete(hazard.id);
    emitter.emit("hazard.remove", {
        id: hazard.id,
        reason: "cleared"
    });
    emitter.emit("factory.stock", restoreFactoryStock(state, hazard.cityId, hazard.type));
};

const resolveBulletStep = (
    context: TickContext,
    bullet: BulletState,
    bulletId: string,
    result: BulletStepResult
): boolean => {
    if (result.kind === "none") {
        context.state.bullets.set(bulletId, result.bullet);
        return false;
    }

    context.state.bullets.delete(bulletId);

    if (result.kind === "out_of_bounds") {
        handleOutOfBounds(context.emitter, bulletId);
        return false;
    }

    if (result.kind === "hit_terrain") {
        handleTerrainHit(context.emitter, bulletId);
        return false;
    }

    if (result.kind === "hit_player") {
        return handlePlayerHit(context, bullet, bulletId, result);
    }

    if (result.kind === "hit_building") {
        handleBuildingHit(context, bulletId, result);
        return false;
    }

    handleHazardHit(context, bulletId, result);
    return false;
};

export const tickBullets = (state: RuntimeState, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    const context: TickContext = { state, emitter };
    let snapshotDirty = false;
    const combatTargets = [
        ...state.buildings.values(),
        ...state.defenses.values()
    ] as CombatBuildingState[];
    const combatHazards = [...state.hazards.values()].map((hazard) => ({
        id: hazard.id,
        x: hazard.x,
        y: hazard.y,
        radius: hazard.radius
    })) as CombatHazardState[];
    const blockedTileSet = state.blockingTiles;
    const isBlockedTile = (tileX: number, tileY: number): boolean => {
        return blockedTileSet.has(`${tileX},${tileY}`);
    };

    for (const [bulletId, bullet] of state.bullets.entries()) {
        const result = stepBulletAndResolve(
            bullet,
            config.bulletTickMs,
            config.mapMax,
            config.mapMax,
            asCombatPlayers(state),
            combatTargets,
            combatHazards,
            isBlockedTile
        );
        snapshotDirty = resolveBulletStep(context, bullet, bulletId, result) || snapshotDirty;
    }

    if (snapshotDirty) {
        emitPlayersSnapshot(state, emitter);
    }
};
