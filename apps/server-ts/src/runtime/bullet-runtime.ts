import {
    normalizeHeading32,
    stepBulletAndResolve,
    type BulletStepResult,
    type BulletState,
    type CombatPlayerState,
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
import { emitPlayersSnapshot } from "./snapshot.js";
import { restoreFactoryStock } from "../domain/factories/FactoryService.js";
import { detonateActiveBombsOwnedBy } from "../domain/hazards/HazardService.js";
import { eliminatePlayer } from "./player-elimination.js";

const PLAYER_SPRITE_HALF = 24;
const MAX_CLIENT_SHOT_OFFSET = 96;
const BULLET_TYPE_LASER = 0;
const BULLET_TYPE_ROCKET = 1;
const BULLET_TYPE_FLARE = 3;
const ITEM_TYPE_ROCKET = 1;
const ITEM_TYPE_FLARE = 6;
const ITEM_TYPE_LASER = 12;
const TILE_SIZE = 48;
const BUILDING_FOOTPRINT_TILES = 3;
const REDUCED_BLOCKING_HEIGHT_TILES = 2;
const BULLET_SWEEP_STEP_PX = 8;

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
    config: RuntimeConfig;
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

    eliminatePlayer(state, emitter, context.config, result.playerId, {
        by: bullet.ownerId
    });
    detonateActiveBombsOwnedBy(state, emitter, context.config, result.playerId);
    return true;
};

const handleBuildingHit = (
    context: TickContext,
    bullet: BulletState,
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
        const buildingPopulation = Number.isFinite(building.population) ? building.population : 0;
        const isStructureDamageBullet = bullet.type === BULLET_TYPE_LASER || bullet.type === BULLET_TYPE_ROCKET;
        const canDamageStructure = isStructureDamageBullet && buildingPopulation <= 0;
        if (!canDamageStructure) {
            return;
        }

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

const resolveBlockingHeightTiles = (buildingType: number): number => {
    const family = Math.max(0, Math.floor(buildingType / 100));
    return family <= 2 ? REDUCED_BLOCKING_HEIGHT_TILES : BUILDING_FOOTPRINT_TILES;
};

const collectCombatTargets = (
    state: RuntimeState,
    friendlyCityId: number
): CombatBuildingState[] => {
    const targets: CombatBuildingState[] = [];
    for (const building of state.buildings.values()) {
        const blockingHeightTiles = resolveBlockingHeightTiles(building.type);
        for (let dx = 0; dx < BUILDING_FOOTPRINT_TILES; dx += 1) {
            for (let dy = 0; dy < blockingHeightTiles; dy += 1) {
                targets.push({
                    id: building.id,
                    cityId: building.cityId,
                    tileX: building.tileX + dx,
                    tileY: building.tileY + dy,
                    health: building.health,
                    maxHealth: building.maxHealth
                });
            }
        }
    }
    for (const defense of state.defenses.values()) {
        if (defense.cityId === friendlyCityId) {
            continue;
        }
        targets.push({
            id: defense.id,
            cityId: defense.cityId,
            tileX: defense.tileX,
            tileY: defense.tileY,
            health: defense.health,
            maxHealth: defense.maxHealth
        });
    }
    return targets;
};

const collectCombatHazards = (
    state: RuntimeState,
    tileSize: number
): CombatHazardState[] => {
    const halfTile = tileSize / 2;
    return [...state.hazards.values()].map((hazard) => ({
        id: hazard.id,
        x: hazard.x + halfTile,
        y: hazard.y + halfTile,
        radius: tileSize
    }));
};

const collectCombatPlayers = (
    state: RuntimeState,
    tileSize: number
): CombatPlayerState[] => {
    const halfTile = tileSize / 2;
    return [...state.players.values()].map((player) => ({
        id: player.id,
        city: player.city,
        x: player.x + halfTile,
        y: player.y + halfTile,
        health: player.health,
        maxHealth: player.maxHealth
    }));
};

const resolveBulletSweepSteps = (bullet: BulletState, tickMs: number): number => {
    if (!Number.isFinite(tickMs) || tickMs <= 0) {
        return 1;
    }
    const speed = Number.isFinite(bullet.speed) ? Math.max(0, bullet.speed) : 0;
    const travelDistance = speed * (tickMs / 1000);
    if (!Number.isFinite(travelDistance) || travelDistance <= 0) {
        return 1;
    }
    return Math.max(1, Math.ceil(travelDistance / BULLET_SWEEP_STEP_PX));
};

const stepBulletWithSweep = (
    bullet: BulletState,
    tickMs: number,
    mapMaxX: number,
    mapMaxY: number,
    players: Iterable<CombatPlayerState>,
    buildings: Iterable<CombatBuildingState>,
    hazards: Iterable<CombatHazardState>,
    isBlockedTile: (tileX: number, tileY: number) => boolean
): BulletStepResult => {
    const steps = resolveBulletSweepSteps(bullet, tickMs);
    const stepMs = tickMs / steps;
    let current = bullet;
    for (let step = 0; step < steps; step += 1) {
        const result = stepBulletAndResolve(
            current,
            stepMs,
            mapMaxX,
            mapMaxY,
            players,
            buildings,
            hazards,
            isBlockedTile
        );
        if (result.kind !== "none") {
            return result;
        }
        current = result.bullet;
    }
    return {
        kind: "none",
        bullet: current
    };
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
        handleBuildingHit(context, bullet, bulletId, result);
        return false;
    }

    handleHazardHit(context, bulletId, result);
    return false;
};

export const tickBullets = (state: RuntimeState, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    const context: TickContext = { state, emitter, config };
    let snapshotDirty = false;
    const blockedTileSet = state.blockingTiles;
    const isBlockedTile = (tileX: number, tileY: number): boolean => {
        return blockedTileSet.has(`${tileX},${tileY}`);
    };

    for (const [bulletId, bullet] of state.bullets.entries()) {
        const combatPlayers = collectCombatPlayers(state, config.tileSize || TILE_SIZE);
        const combatTargets = collectCombatTargets(state, bullet.city);
        const combatHazards = collectCombatHazards(state, config.tileSize || TILE_SIZE);
        const result = stepBulletWithSweep(
            bullet,
            config.bulletTickMs,
            config.mapMax,
            config.mapMax,
            combatPlayers,
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
