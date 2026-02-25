import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeHazard,
    type RuntimeState
} from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { removePlayer } from "../../runtime/player-runtime.js";
import { emitPlayersSnapshot } from "../../runtime/snapshot.js";
import { distanceSquared } from "../shared/distance.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";
import { unregisterBuildingPopulation } from "../population/PopulationService.js";

const TILE = 48;
const TILE_INNER_PADDING = 8;
const TILE_INNER_SIZE = TILE - (2 * TILE_INNER_PADDING);
const ITEM_TYPE_CLOAK = 0;
const ITEM_TYPE_ROCKET = 1;
const ITEM_TYPE_MEDKIT = 2;
const ITEM_TYPE_BOMB = 3;
const ITEM_TYPE_MINE = 4;
const ITEM_TYPE_FLARE = 6;
const ITEM_TYPE_DFG = 7;
const ITEM_TYPE_LASER = 12;
const LEGACY_BOMB_FUSE_MS = 5000;
const LEGACY_BOMB_DAMAGE = 25;
const LEGACY_BOMB_PLAYER_TILE_RADIUS = 1;
const LEGACY_BOMB_STRUCTURE_TILE_RADIUS = 1;
const LEGACY_MINE_DAMAGE = 19;
const LEGACY_TRIGGER_REVEAL_MS = 750;
const LEGACY_DFG_FREEZE_MS = 5000;
const COMMAND_CENTER_BUILDING_TYPE = 0;
const BUILDING_FOOTPRINT_TILES = 3;
const PASSIVE_DROP_RADIUS = TILE / 2;
const PASSIVE_DROP_TYPES = new Set([
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_LASER
]);
const EXPLOSIVE_HAZARD_TYPES = new Set([ITEM_TYPE_BOMB, ITEM_TYPE_MINE, ITEM_TYPE_DFG]);

const isHazardType = (type: number): boolean => {
    return EXPLOSIVE_HAZARD_TYPES.has(type) || PASSIVE_DROP_TYPES.has(type);
};

const snapToTile = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.floor(value / TILE) * TILE;
};

const intersectsHazardTile = (
    playerX: number,
    playerY: number,
    hazardX: number,
    hazardY: number
): boolean => {
    const playerLeft = playerX + TILE_INNER_PADDING;
    const playerTop = playerY + TILE_INNER_PADDING;
    const playerRight = playerLeft + TILE_INNER_SIZE;
    const playerBottom = playerTop + TILE_INNER_SIZE;
    const hazardLeft = hazardX;
    const hazardTop = hazardY;
    const hazardRight = hazardLeft + TILE;
    const hazardBottom = hazardTop + TILE;
    return playerLeft < hazardRight
        && playerRight > hazardLeft
        && playerTop < hazardBottom
        && playerBottom > hazardTop;
};

const shouldDamagePlayer = (
    hazard: RuntimeHazard,
    playerId: string,
    playerCityId: number
): boolean => {
    if (playerId === hazard.ownerId) {
        return false;
    }
    return playerCityId !== hazard.cityId;
};

const applyHazardDamage = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    hazard: RuntimeHazard,
    playerId: string,
    amount: number
): boolean => {
    const player = state.players.get(playerId);
    if (!player) {
        return false;
    }
    const health = Math.max(0, player.health - amount);
    state.players.set(playerId, {
        ...player,
        health
    });
    emitter.emit("player.health", {
        id: playerId,
        health,
        maxHealth: player.maxHealth,
        source: "hazard"
    });
    if (health === 0) {
        emitter.emit("player.dead", {
            id: playerId,
            by: hazard.ownerId
        });
        const removedBulletIds = removePlayer(state, playerId);
        for (const removedBulletId of removedBulletIds) {
            emitter.emit("bullet.resolved", {
                id: removedBulletId,
                reason: "out_of_bounds"
            });
        }
        detonateActiveBombsOwnedBy(state, emitter, playerId);
        return true;
    }
    return false;
};

const toTileCenter = (value: number): number => {
    return Math.floor((value + (TILE / 2)) / TILE);
};

const triggerHazardReveal = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    hazard: RuntimeHazard
): void => {
    hazard.active = false;
    hazard.armed = false;
    hazard.remainingMs = LEGACY_TRIGGER_REVEAL_MS;
    state.hazards.set(hazard.id, hazard);
    emitter.emit("hazard.spawn", {
        id: hazard.id,
        cityId: hazard.cityId,
        type: hazard.type,
        position: { x: hazard.x, y: hazard.y },
        radius: hazard.radius,
        armed: false
    });
};

const detonateBomb = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    hazardId: string,
    hazard: RuntimeHazard
): boolean => {
    let snapshotDirty = false;
    const centerTileX = toTileCenter(hazard.x);
    const centerTileY = toTileCenter(hazard.y);

    for (const [playerId, player] of state.players.entries()) {
        if (!shouldDamagePlayer(hazard, playerId, player.city)) {
            continue;
        }
        const playerTileX = toTileCenter(player.x);
        const playerTileY = toTileCenter(player.y);
        if (Math.abs(playerTileX - centerTileX) > LEGACY_BOMB_PLAYER_TILE_RADIUS
            || Math.abs(playerTileY - centerTileY) > LEGACY_BOMB_PLAYER_TILE_RADIUS) {
            continue;
        }
        snapshotDirty = applyHazardDamage(state, emitter, hazard, playerId, hazard.damage) || snapshotDirty;
    }

    for (const [buildingId, building] of Array.from(state.buildings.entries())) {
        const minTileX = building.tileX;
        const maxTileX = building.tileX + BUILDING_FOOTPRINT_TILES - 1;
        const minTileY = building.tileY;
        const maxTileY = building.tileY + BUILDING_FOOTPRINT_TILES - 1;
        const nearestX = Math.max(minTileX, Math.min(centerTileX, maxTileX));
        const nearestY = Math.max(minTileY, Math.min(centerTileY, maxTileY));
        if (Math.abs(nearestX - centerTileX) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS
            || Math.abs(nearestY - centerTileY) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS) {
            continue;
        }
        if (building.type === COMMAND_CENTER_BUILDING_TYPE) {
            continue;
        }
        state.buildings.delete(buildingId);
        emitter.emit("building.demolished", {
            id: building.id,
            cityId: building.cityId
        });
        const populationUpdates = unregisterBuildingPopulation(state, building);
        for (const update of populationUpdates) {
            emitter.emit("population.update", update);
        }
    }

    for (const [defenseId, defense] of Array.from(state.defenses.entries())) {
        if (Math.abs(defense.tileX - centerTileX) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS
            || Math.abs(defense.tileY - centerTileY) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS) {
            continue;
        }
        state.defenses.delete(defenseId);
        emitter.emit("defense.remove", {
            id: defenseId,
            reason: "destroyed"
        });
    }

    for (const [otherHazardId, otherHazard] of Array.from(state.hazards.entries())) {
        const hazardTileX = toTileCenter(otherHazard.x);
        const hazardTileY = toTileCenter(otherHazard.y);
        if (Math.abs(hazardTileX - centerTileX) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS
            || Math.abs(hazardTileY - centerTileY) > LEGACY_BOMB_STRUCTURE_TILE_RADIUS) {
            continue;
        }
        state.hazards.delete(otherHazardId);
        emitter.emit("hazard.remove", {
            id: otherHazardId,
            reason: "detonated"
        });
    }

    if (state.hazards.has(hazardId)) {
        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "detonated"
        });
    }
    return snapshotDirty;
};

export const detonateActiveBombsOwnedBy = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    ownerId: string
): boolean => {
    let snapshotDirty = false;
    for (const [hazardId, hazard] of Array.from(state.hazards.entries())) {
        if (hazard.ownerId !== ownerId || hazard.type !== ITEM_TYPE_BOMB || !hazard.active || !hazard.armed) {
            continue;
        }
        snapshotDirty = detonateBomb(state, emitter, hazardId, hazard) || snapshotDirty;
    }
    return snapshotDirty;
};

export type HazardDeployResult = {
    hazard: KnownEventPayloadByType["hazard.spawn"];
    inventory?: KnownEventPayloadByType["inventory.update"];
};

export const deployHazard = (
    state: RuntimeState,
    socketId: string,
    cityId: number,
    payload: KnownEventPayloadByType["hazard.deploy.request"],
    nextSeq: () => number,
    config: RuntimeConfig
): CommandResult<HazardDeployResult> => {
    if (payload.cityId !== cityId) {
        return rejectResult("hazard_invalid");
    }

    const type = Math.floor(payload.type);
    if (!Number.isFinite(type) || !isHazardType(type)) {
        return rejectResult("hazard_invalid");
    }

    const consumed = consumeInventoryItem(state, socketId, type);
    if (!consumed.ok) {
        return consumed;
    }

    const isPassiveDrop = PASSIVE_DROP_TYPES.has(type);
    const isBomb = type === ITEM_TYPE_BOMB;
    const isMine = type === ITEM_TYPE_MINE;
    const isDfg = type === ITEM_TYPE_DFG;
    const armed = isPassiveDrop ? false : (isBomb ? payload.armed !== false : true);
    const active = !isPassiveDrop && armed;
    const requestedFuseMs = typeof payload.fuseMs === "number" && Number.isFinite(payload.fuseMs)
        ? Math.floor(payload.fuseMs)
        : null;
    const defaultFuseMs = isBomb ? LEGACY_BOMB_FUSE_MS : config.hazardDefaultFuseMs;
    const remainingMs = active
        ? Math.max(100, requestedFuseMs ?? defaultFuseMs)
        : Number.POSITIVE_INFINITY;
    const damage = isPassiveDrop
        ? 0
        : Math.max(1, Math.floor(
            payload.damage
            ?? (isMine ? LEGACY_MINE_DAMAGE : (isBomb ? LEGACY_BOMB_DAMAGE : config.hazardDefaultDamage))
        ));

    const hazard: RuntimeHazard = {
        id: `hazard_${nextSeq()}`,
        ownerId: socketId,
        cityId,
        type,
        x: snapToTile(payload.position.x),
        y: snapToTile(payload.position.y),
        radius: Math.max(8, Math.floor(
            payload.radius
            ?? (isPassiveDrop
                ? PASSIVE_DROP_RADIUS
                : (isMine || isDfg ? TILE : TILE * LEGACY_BOMB_STRUCTURE_TILE_RADIUS))
        )),
        damage,
        remainingMs,
        armed,
        active
    };
    state.hazards.set(hazard.id, hazard);

    return okResult({
        hazard: {
            id: hazard.id,
            cityId: hazard.cityId,
            type: hazard.type,
            position: { x: hazard.x, y: hazard.y },
            radius: hazard.radius,
            armed: hazard.armed
        },
        inventory: consumed.value
    });
};

export const tickHazards = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    let snapshotDirty = false;
    for (const [hazardId, hazard] of state.hazards.entries()) {
        if (!hazard.active) {
            if (hazard.remainingMs !== Number.POSITIVE_INFINITY) {
                hazard.remainingMs -= deltaMs;
                if (hazard.remainingMs <= 0) {
                    state.hazards.delete(hazardId);
                    emitter.emit("hazard.remove", {
                        id: hazardId,
                        reason: "expired"
                    });
                    continue;
                }
                state.hazards.set(hazardId, hazard);
            }
            continue;
        }

        if (hazard.type === ITEM_TYPE_MINE || hazard.type === ITEM_TYPE_DFG) {
            let triggered = false;
            for (const [playerId, player] of state.players.entries()) {
                if (!shouldDamagePlayer(hazard, playerId, player.city)) {
                    continue;
                }
                if (!intersectsHazardTile(player.x, player.y, hazard.x, hazard.y)) {
                    continue;
                }
                if (hazard.type === ITEM_TYPE_MINE) {
                    snapshotDirty = applyHazardDamage(state, emitter, hazard, playerId, hazard.damage) || snapshotDirty;
                } else {
                    state.players.set(playerId, {
                        ...player,
                        frozenUntil: Date.now() + LEGACY_DFG_FREEZE_MS,
                        frozenBy: "dfg"
                    });
                }
                triggered = true;
                break;
            }
            if (!triggered) {
                continue;
            }

            triggerHazardReveal(state, emitter, hazard);
            continue;
        }

        if (hazard.remainingMs !== Number.POSITIVE_INFINITY) {
            hazard.remainingMs -= deltaMs;
        }
        if (hazard.remainingMs > 0) {
            state.hazards.set(hazardId, hazard);
            continue;
        }

        if (hazard.type === ITEM_TYPE_BOMB) {
            snapshotDirty = detonateBomb(state, emitter, hazardId, hazard) || snapshotDirty;
            continue;
        }

        const radiusSq = hazard.radius * hazard.radius;
        for (const [playerId, player] of state.players.entries()) {
            if (!shouldDamagePlayer(hazard, playerId, player.city)) {
                continue;
            }
            if (distanceSquared({ x: player.x, y: player.y }, { x: hazard.x, y: hazard.y }) > radiusSq) {
                continue;
            }
            snapshotDirty = applyHazardDamage(state, emitter, hazard, playerId, hazard.damage) || snapshotDirty;
        }

        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "detonated"
        });
    }
    if (snapshotDirty) {
        emitPlayersSnapshot(state, emitter);
    }
};
