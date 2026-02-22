import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { CommandResult, RuntimeConfig, RuntimeBuilding, RuntimeState } from "./types.js";

export const placeBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.place.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<RuntimeBuilding> => {
    const city = state.socketCities.get(socketId);
    if (city === undefined) {
        return { ok: false, reason: "player_not_joined" };
    }
    if (city !== payload.cityId) {
        return { ok: false, reason: "city_mismatch" };
    }

    const building: RuntimeBuilding = {
        id: `building_${nextSeq()}`,
        ownerId: socketId,
        cityId: city,
        type: payload.type,
        tileX: Math.max(0, Math.floor(payload.tileX)),
        tileY: Math.max(0, Math.floor(payload.tileY)),
        health: config.defaultBuildingHealth,
        maxHealth: config.defaultBuildingHealth
    };

    state.buildings.set(building.id, building);
    return { ok: true, value: building };
};

export const demolishBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.demolish.request"]
): CommandResult<RuntimeBuilding> => {
    const city = state.socketCities.get(socketId);
    const building = state.buildings.get(payload.id);
    if (city === undefined) {
        return { ok: false, reason: "player_not_joined" };
    }
    if (!building) {
        return { ok: false, reason: "building_not_found" };
    }
    if (building.cityId !== city || payload.cityId !== city) {
        return { ok: false, reason: "city_mismatch" };
    }

    if (payload.ownerId && payload.ownerId !== building.ownerId) {
        return { ok: false, reason: "owner_mismatch" };
    }

    state.buildings.delete(building.id);
    return { ok: true, value: building };
};
