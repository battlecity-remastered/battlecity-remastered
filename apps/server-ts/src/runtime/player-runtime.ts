import {
    advancePlayer,
    normalizeHeading32,
    type CombatPlayerState
} from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeConfig, RuntimePlayer, RuntimeState } from "./types.js";
import { resolveSpawnPosition } from "../domain/spawn/SpawnService.js";

const makeDefaultPlayer = (
    socketId: string,
    city: number,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): RuntimePlayer => {
    return {
        id: socketId,
        city,
        x: payload.offset.x,
        y: payload.offset.y,
        direction: normalizeHeading32(payload.direction),
        speed: config.playerSpeed,
        health: 100,
        maxHealth: 100
    };
};

export const upsertPlayerFromUpdate = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): void => {
    const city = state.socketCities.get(socketId) ?? payload.city ?? config.defaultCity;
    state.socketCities.set(socketId, city);

    const current = state.players.get(socketId) ?? makeDefaultPlayer(socketId, city, payload, config);
    const withDirection: RuntimePlayer = {
        ...current,
        city,
        direction: normalizeHeading32(payload.direction)
    };

    const moved = payload.isMoving
        ? {
            ...advancePlayer(withDirection, config.serverStepMs, config.mapMax, config.mapMax),
            city,
            health: current.health,
            maxHealth: current.maxHealth
        }
        : withDirection;

    const spawnSafe = resolveSpawnPosition(state, city, moved.x, moved.y, config);
    const next = {
        ...moved,
        x: spawnSafe.x,
        y: spawnSafe.y
    };

    state.players.set(socketId, next);
};

export const removeOwnedBullets = (state: RuntimeState, ownerId: string): string[] => {
    const removedIds: string[] = [];
    for (const [bulletId, bullet] of state.bullets.entries()) {
        if (bullet.ownerId !== ownerId) {
            continue;
        }
        removedIds.push(bulletId);
        state.bullets.delete(bulletId);
    }
    return removedIds;
};

export const removePlayer = (state: RuntimeState, playerId: string): string[] => {
    state.players.delete(playerId);
    return removeOwnedBullets(state, playerId);
};

export const asCombatPlayers = (state: RuntimeState): Iterable<CombatPlayerState> => {
    return state.players.values() as Iterable<CombatPlayerState>;
};
