import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeConfig, RuntimeBuilding, RuntimeState } from "./types.js";

export const placeBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.place.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): RuntimeBuilding | null => {
    const city = state.socketCities.get(socketId);
    if (city === undefined || city !== payload.cityId) {
        return null;
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
    return building;
};

export const demolishBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.demolish.request"]
): RuntimeBuilding | null => {
    const city = state.socketCities.get(socketId);
    const building = state.buildings.get(payload.id);
    if (city === undefined || !building || building.cityId !== city || payload.cityId !== city) {
        return null;
    }

    if (payload.ownerId && payload.ownerId !== building.ownerId) {
        return null;
    }

    state.buildings.delete(building.id);
    return building;
};
