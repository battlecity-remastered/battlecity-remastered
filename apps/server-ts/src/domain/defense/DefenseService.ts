import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeDefense,
    type RuntimeState
} from "../../runtime/types.js";
import { spendCityCash } from "../economy/CityEconomyService.js";

const DEFENSE_MAX_HEALTH: Record<number, number> = {
    8: 40,
    9: 32,
    10: 16,
    11: 40
};

const isAllowedDefenseType = (type: number): boolean => {
    return Object.hasOwn(DEFENSE_MAX_HEALTH, type);
};

const isTileBlocked = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    for (const building of state.buildings.values()) {
        if (building.tileX === tileX && building.tileY === tileY) {
            return true;
        }
    }

    for (const defense of state.defenses.values()) {
        if (defense.tileX === tileX && defense.tileY === tileY) {
            return true;
        }
    }

    for (const hazard of state.hazards.values()) {
        const hazardTileX = Math.floor(hazard.x / 32);
        const hazardTileY = Math.floor(hazard.y / 32);
        if (hazardTileX === tileX && hazardTileY === tileY) {
            return true;
        }
    }

    return false;
};

const asSpawnPayload = (
    defense: RuntimeDefense
): KnownEventPayloadByType["defense.spawn"] => {
    return {
        id: defense.id,
        cityId: defense.cityId,
        type: defense.type,
        tileX: defense.tileX,
        tileY: defense.tileY,
        health: defense.health,
        maxHealth: defense.maxHealth
    };
};

export const deployDefense = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["defense.deploy.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<KnownEventPayloadByType["defense.spawn"]> => {
    const city = state.socketCities.get(socketId);
    if (city === undefined || city !== payload.cityId) {
        return rejectResult("city_mismatch");
    }

    if (!isAllowedDefenseType(payload.type)) {
        return rejectResult("defense_blocked");
    }

    if (isTileBlocked(state, payload.tileX, payload.tileY)) {
        return rejectResult("defense_blocked");
    }

    if (!spendCityCash(state, payload.cityId, config.defenseCost, config)) {
        return rejectResult("insufficient_funds");
    }

    const maxHealth = DEFENSE_MAX_HEALTH[payload.type] ?? 20;
    const defense: RuntimeDefense = {
        id: `defense_${nextSeq()}`,
        cityId: payload.cityId,
        type: payload.type,
        tileX: payload.tileX,
        tileY: payload.tileY,
        health: maxHealth,
        maxHealth
    };
    state.defenses.set(defense.id, defense);

    return okResult(asSpawnPayload(defense));
};

export const clearCityDefenses = (state: RuntimeState, cityId: number): string[] => {
    const removed: string[] = [];
    for (const [defenseId, defense] of state.defenses.entries()) {
        if (defense.cityId !== cityId) {
            continue;
        }
        state.defenses.delete(defenseId);
        removed.push(defenseId);
    }
    return removed;
};
