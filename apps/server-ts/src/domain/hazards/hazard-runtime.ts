import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeConfig, RuntimeHazard, RuntimeState } from "../../runtime/types.js";
import { emitPlayersSnapshot } from "../../runtime/snapshot.js";
import { eliminatePlayer } from "../../runtime/player-elimination.js";
import { distanceSquared } from "../shared/distance.js";
import { removeStructuresInBombRadius } from "./hazard-bomb-structures.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_DFG,
    ITEM_TYPE_MINE,
    LEGACY_BOMB_PLAYER_TILE_RADIUS,
    LEGACY_DFG_FREEZE_MS,
    LEGACY_TRIGGER_REVEAL_MS,
    intersectsHazardTile,
    isWithinTileRadius,
    shouldDamagePlayer,
    toTileCenter
} from "./hazard-constants.js";

const applyHazardDamage = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
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
        eliminatePlayer(state, emitter, config, playerId, {
            by: hazard.ownerId
        });
        detonateActiveBombsOwnedBy(state, emitter, config, playerId);
        return true;
    }
    return false;
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
        armed: false,
        active: false
    });
};

const damagePlayersInBombRadius = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    hazard: RuntimeHazard,
    centerTileX: number,
    centerTileY: number
): boolean => {
    let snapshotDirty = false;
    for (const [playerId, player] of state.players.entries()) {
        if (!shouldDamagePlayer(hazard, playerId, player.city)) {
            continue;
        }
        const playerTileX = toTileCenter(player.x);
        const playerTileY = toTileCenter(player.y);
        if (!isWithinTileRadius(
            playerTileX,
            playerTileY,
            centerTileX,
            centerTileY,
            LEGACY_BOMB_PLAYER_TILE_RADIUS
        )) {
            continue;
        }
        snapshotDirty = applyHazardDamage(state, emitter, config, hazard, playerId, hazard.damage) || snapshotDirty;
    }
    return snapshotDirty;
};

const detonateBomb = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    hazardId: string,
    hazard: RuntimeHazard
): boolean => {
    const centerTileX = toTileCenter(hazard.x);
    const centerTileY = toTileCenter(hazard.y);

    const snapshotDirty = damagePlayersInBombRadius(state, emitter, config, hazard, centerTileX, centerTileY);
    removeStructuresInBombRadius(state, emitter, centerTileX, centerTileY);

    if (state.hazards.has(hazardId)) {
        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "detonated"
        });
    }
    return snapshotDirty;
};

const tickInactiveHazard = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    hazardId: string,
    hazard: RuntimeHazard,
    deltaMs: number
): boolean => {
    if (hazard.active) {
        return false;
    }
    if (hazard.remainingMs === Number.POSITIVE_INFINITY) {
        return true;
    }
    hazard.remainingMs -= deltaMs;
    if (hazard.remainingMs <= 0) {
        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "expired"
        });
        return true;
    }
    state.hazards.set(hazardId, hazard);
    return true;
};

const triggerProximityHazard = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    hazard: RuntimeHazard
): boolean => {
    if (hazard.type !== ITEM_TYPE_MINE && hazard.type !== ITEM_TYPE_DFG) {
        return false;
    }

    let snapshotDirty = false;
    let triggered = false;
    for (const [playerId, player] of state.players.entries()) {
        if (!shouldDamagePlayer(hazard, playerId, player.city)) {
            continue;
        }
        if (!intersectsHazardTile(player.x, player.y, hazard.x, hazard.y)) {
            continue;
        }
        if (hazard.type === ITEM_TYPE_MINE) {
            snapshotDirty = applyHazardDamage(state, emitter, config, hazard, playerId, hazard.damage) || snapshotDirty;
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
        return false;
    }
    triggerHazardReveal(state, emitter, hazard);
    return snapshotDirty;
};

const applyRadiusHazardDamage = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    hazard: RuntimeHazard
): boolean => {
    let snapshotDirty = false;
    const radiusSq = hazard.radius * hazard.radius;
    for (const [playerId, player] of state.players.entries()) {
        if (!shouldDamagePlayer(hazard, playerId, player.city)) {
            continue;
        }
        if (distanceSquared({ x: player.x, y: player.y }, { x: hazard.x, y: hazard.y }) > radiusSq) {
            continue;
        }
        snapshotDirty = applyHazardDamage(state, emitter, config, hazard, playerId, hazard.damage) || snapshotDirty;
    }
    return snapshotDirty;
};

const tickActiveTimedHazard = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    hazardId: string,
    hazard: RuntimeHazard,
    deltaMs: number
): boolean => {
    if (hazard.remainingMs !== Number.POSITIVE_INFINITY) {
        hazard.remainingMs -= deltaMs;
    }
    if (hazard.remainingMs > 0) {
        state.hazards.set(hazardId, hazard);
        return false;
    }

    if (hazard.type === ITEM_TYPE_BOMB) {
        return detonateBomb(state, emitter, config, hazardId, hazard);
    }

    const snapshotDirty = applyRadiusHazardDamage(state, emitter, config, hazard);
    state.hazards.delete(hazardId);
    emitter.emit("hazard.remove", {
        id: hazardId,
        reason: "detonated"
    });
    return snapshotDirty;
};

export const detonateActiveBombsOwnedBy = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    ownerId: string
): boolean => {
    let snapshotDirty = false;
    for (const [hazardId, hazard] of Array.from(state.hazards.entries())) {
        if (hazard.ownerId !== ownerId || hazard.type !== ITEM_TYPE_BOMB || !hazard.active || !hazard.armed) {
            continue;
        }
        snapshotDirty = detonateBomb(state, emitter, config, hazardId, hazard) || snapshotDirty;
    }
    return snapshotDirty;
};

export const tickHazards = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    let snapshotDirty = false;
    for (const [hazardId, hazard] of state.hazards.entries()) {
        if (tickInactiveHazard(state, emitter, hazardId, hazard, deltaMs)) {
            continue;
        }

        const proximityDirty = triggerProximityHazard(state, emitter, config, hazard);
        if (proximityDirty || (hazard.type === ITEM_TYPE_MINE || hazard.type === ITEM_TYPE_DFG)) {
            snapshotDirty = proximityDirty || snapshotDirty;
            continue;
        }

        snapshotDirty = tickActiveTimedHazard(state, emitter, config, hazardId, hazard, deltaMs) || snapshotDirty;
    }
    if (snapshotDirty) {
        emitPlayersSnapshot(state, emitter);
    }
};
