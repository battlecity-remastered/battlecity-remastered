import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeBuilding,
    type RuntimeState
} from "./types.js";

export const placeBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.place.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<RuntimeBuilding> => {
    const city = state.socketCities.get(socketId);
    if (city === undefined) {
        return rejectResult("player_not_joined");
    }
    if (city !== payload.cityId) {
        return rejectResult("city_mismatch");
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
    return okResult(building);
};

export const demolishBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.demolish.request"]
): CommandResult<RuntimeBuilding> => {
    const city = state.socketCities.get(socketId);
    const building = state.buildings.get(payload.id);
    if (city === undefined) {
        return rejectResult("player_not_joined");
    }
    if (!building) {
        return rejectResult("building_not_found");
    }
    if (building.cityId !== city || payload.cityId !== city) {
        return rejectResult("city_mismatch");
    }

    if (payload.ownerId && payload.ownerId !== building.ownerId) {
        return rejectResult("owner_mismatch");
    }

    state.buildings.delete(building.id);
    return okResult(building);
};
