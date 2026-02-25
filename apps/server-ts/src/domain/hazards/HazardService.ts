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
import { distanceSquared } from "../shared/distance.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";

const TILE = 48;
const TILE_INNER_PADDING = 8;
const TILE_INNER_SIZE = TILE - (2 * TILE_INNER_PADDING);
const ITEM_TYPE_BOMB = 3;
const ITEM_TYPE_MINE = 4;
const ITEM_TYPE_DFG = 7;
const LEGACY_BOMB_FUSE_MS = 5000;
const LEGACY_BOMB_DAMAGE = 25;
const LEGACY_BOMB_PLAYER_TILE_RADIUS = 1;
const LEGACY_MINE_DAMAGE = 19;

const isHazardType = (type: number): boolean => {
    return type === ITEM_TYPE_BOMB || type === ITEM_TYPE_MINE || type === ITEM_TYPE_DFG;
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
): void => {
    const player = state.players.get(playerId);
    if (!player) {
        return;
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
    }
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

    const isBomb = type === ITEM_TYPE_BOMB;
    const isMine = type === ITEM_TYPE_MINE;
    const isDfg = type === ITEM_TYPE_DFG;
    const armed = isBomb ? payload.armed !== false : true;
    const active = armed;
    const requestedFuseMs = typeof payload.fuseMs === "number" && Number.isFinite(payload.fuseMs)
        ? Math.floor(payload.fuseMs)
        : null;
    const defaultFuseMs = isBomb ? LEGACY_BOMB_FUSE_MS : config.hazardDefaultFuseMs;
    const remainingMs = active
        ? Math.max(100, requestedFuseMs ?? defaultFuseMs)
        : Number.POSITIVE_INFINITY;

    const hazard: RuntimeHazard = {
        id: `hazard_${nextSeq()}`,
        ownerId: socketId,
        cityId,
        type,
        x: snapToTile(payload.position.x),
        y: snapToTile(payload.position.y),
        radius: Math.max(8, Math.floor(
            payload.radius
            ?? (isMine || isDfg ? TILE : TILE * (1 + LEGACY_BOMB_PLAYER_TILE_RADIUS))
        )),
        damage: Math.max(1, Math.floor(
            payload.damage
            ?? (isMine ? LEGACY_MINE_DAMAGE : (isBomb ? LEGACY_BOMB_DAMAGE : config.hazardDefaultDamage))
        )),
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
    for (const [hazardId, hazard] of state.hazards.entries()) {
        if (!hazard.active) {
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
                    applyHazardDamage(state, emitter, hazard, playerId, hazard.damage);
                }
                triggered = true;
                break;
            }
            if (!triggered) {
                continue;
            }

            state.hazards.delete(hazardId);
            emitter.emit("hazard.remove", {
                id: hazardId,
                reason: "detonated"
            });
            continue;
        }

        if (hazard.remainingMs !== Number.POSITIVE_INFINITY) {
            hazard.remainingMs -= deltaMs;
        }
        if (hazard.remainingMs > 0) {
            state.hazards.set(hazardId, hazard);
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
            applyHazardDamage(state, emitter, hazard, playerId, hazard.damage);
        }

        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "detonated"
        });
    }
};
