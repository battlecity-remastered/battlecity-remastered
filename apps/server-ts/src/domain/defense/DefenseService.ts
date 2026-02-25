import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeBuilding,
    type RuntimeConfig,
    type RuntimeDefense,
    type RuntimeState
} from "../../runtime/types.js";
import { spendCityCash } from "../economy/CityEconomyService.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";

const TILE_SIZE = 48;
const WORLD_TILE_MIN = 0;
const WORLD_TILE_MAX = 512;

const DEFENSE_MAX_HEALTH: Record<number, number> = {
    8: 40,
    9: 32,
    10: 16,
    11: 40
};

const isAllowedDefenseType = (type: number): boolean => {
    return Object.hasOwn(DEFENSE_MAX_HEALTH, type);
};

const isFactoryType = (type: number): boolean => {
    return Math.floor(type / 100) === 1;
};

const isCommandCenter = (type: number): boolean => {
    return type === 0;
};

const isHospital = (type: number): boolean => {
    const family = Math.floor(type / 100);
    return type === 300 || type === 301 || (family === 2 && type >= 200 && type < 300);
};

const isPlacementAllowedOnBuilding = (
    tileX: number,
    tileY: number,
    building: RuntimeBuilding
): boolean => {
    if (isFactoryType(building.type)) {
        const pickupY = building.tileY + 2;
        return tileY === pickupY && tileX >= building.tileX && tileX <= (building.tileX + 2);
    }

    if (isCommandCenter(building.type) || isHospital(building.type)) {
        return tileY === (building.tileY + 2) && tileX >= building.tileX && tileX <= (building.tileX + 2);
    }

    return false;
};

const isOutOfBounds = (tileX: number, tileY: number): boolean => {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return true;
    }

    if (tileX < WORLD_TILE_MIN || tileY < WORLD_TILE_MIN || tileX > WORLD_TILE_MAX || tileY > WORLD_TILE_MAX) {
        return true;
    }
    return false;
};

const hasBlockingBuilding = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    for (const building of state.buildings.values()) {
        const inFootprint = tileX >= building.tileX
            && tileX <= (building.tileX + 2)
            && tileY >= building.tileY
            && tileY <= (building.tileY + 2);
        if (!inFootprint) {
            continue;
        }
        if (!isPlacementAllowedOnBuilding(tileX, tileY, building)) {
            return true;
        }
    }
    return false;
};

const hasBlockingDefense = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    for (const defense of state.defenses.values()) {
        if (defense.tileX === tileX && defense.tileY === tileY) {
            return true;
        }
    }
    return false;
};

const hasBlockingHazard = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    for (const hazard of state.hazards.values()) {
        const hazardTileX = Math.floor(hazard.x / TILE_SIZE);
        const hazardTileY = Math.floor(hazard.y / TILE_SIZE);
        if (hazardTileX === tileX && hazardTileY === tileY) {
            return true;
        }
    }
    return false;
};

const isTileBlocked = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    return isOutOfBounds(tileX, tileY)
        || hasBlockingBuilding(state, tileX, tileY)
        || hasBlockingDefense(state, tileX, tileY)
        || hasBlockingHazard(state, tileX, tileY);
};

const asSpawnPayload = (
    defense: RuntimeDefense
): KnownEventPayloadByType["defense.spawn"] => {
    const base = {
        id: defense.id,
        cityId: defense.cityId,
        type: defense.type,
        tileX: defense.tileX,
        tileY: defense.tileY,
        health: defense.health,
        maxHealth: defense.maxHealth
    };
    const orientation = typeof defense.orientation === "number" && Number.isFinite(defense.orientation)
        ? defense.orientation
        : undefined;
    return orientation === undefined ? base : { ...base, orientation };
};

export const deployDefense = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["defense.deploy.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<DefenseDeployResult> => {
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

    let inventoryUpdate: KnownEventPayloadByType["inventory.update"] | undefined;
    let spentCash = false;
    if (payload.fromInventory === true) {
        const consumed = consumeInventoryItem(state, socketId, payload.type);
        if (!consumed.ok) {
            return rejectResult(consumed.reason);
        }
        inventoryUpdate = consumed.value;
    } else if (!spendCityCash(state, payload.cityId, config.defenseCost, config)) {
        return rejectResult("insufficient_funds");
    } else {
        spentCash = true;
    }

    const maxHealth = DEFENSE_MAX_HEALTH[payload.type] ?? 20;
    const defense: RuntimeDefense = {
        id: `defense_${nextSeq()}`,
        cityId: payload.cityId,
        type: payload.type,
        tileX: payload.tileX,
        tileY: payload.tileY,
        health: maxHealth,
        maxHealth,
        orientation: 0,
        nextShotAt: 0
    };
    state.defenses.set(defense.id, defense);

    const result: DefenseDeployResult = {
        spawn: asSpawnPayload(defense),
        spentCash
    };
    if (inventoryUpdate) {
        result.inventory = inventoryUpdate;
    }

    return okResult(result);
};

export type DefenseDeployResult = {
    spawn: KnownEventPayloadByType["defense.spawn"];
    inventory?: KnownEventPayloadByType["inventory.update"];
    spentCash: boolean;
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
