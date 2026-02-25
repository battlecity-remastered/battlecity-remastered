import type { KnownEventPayloadByType } from "@battlecity/protocol";
import {
    okResult,
    rejectResult,
    type CommandResult,
    type RuntimeConfig,
    type RuntimeBuilding,
    type RuntimeState
} from "./types.js";
import { canBuildInCity, validateBuildResearch } from "../domain/buildings/BuildingRulesService.js";
import { spendCityCash } from "../domain/economy/CityEconomyService.js";
import { registerBuildingPopulation, unregisterBuildingPopulation } from "../domain/population/PopulationService.js";

export const placeBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.place.request"],
    config: RuntimeConfig,
    nextSeq: () => number
): CommandResult<{
    building: RuntimeBuilding;
    populationUpdates: KnownEventPayloadByType["population.update"][];
}> => {
    const city = state.socketCities.get(socketId);
    if (city === undefined) {
        return rejectResult("player_not_joined");
    }
    if (city !== payload.cityId) {
        return rejectResult("city_mismatch");
    }
    if (state.socketRoles.get(socketId) !== "mayor") {
        return rejectResult("not_mayor");
    }

    const tileX = Math.max(0, Math.floor(payload.tileX));
    const tileY = Math.max(0, Math.floor(payload.tileY));
    const placement = canBuildInCity(state, city, payload.type, tileX, tileY, config);
    if (placement === "collision") {
        return rejectResult("building_collision");
    }
    if (placement === "too_far") {
        return rejectResult("build_too_far");
    }
    if (!validateBuildResearch(state, city, payload.type)) {
        return rejectResult("research_required");
    }
    if (!spendCityCash(state, city, config.buildingCost, config)) {
        return rejectResult("insufficient_funds");
    }

    const building: RuntimeBuilding = {
        id: `building_${nextSeq()}`,
        ownerId: socketId,
        cityId: city,
        type: payload.type,
        tileX,
        tileY,
        health: config.defaultBuildingHealth,
        maxHealth: config.defaultBuildingHealth,
        population: 0
    };

    state.buildings.set(building.id, building);
    return okResult({
        building,
        populationUpdates: registerBuildingPopulation(state, building)
    });
};

export const demolishBuildingFromRequest = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["building.demolish.request"]
): CommandResult<{
    building: RuntimeBuilding;
    populationUpdates: KnownEventPayloadByType["population.update"][];
}> => {
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
    if (state.socketRoles.get(socketId) !== "mayor") {
        return rejectResult("not_mayor");
    }

    if (payload.ownerId && payload.ownerId !== building.ownerId) {
        return rejectResult("owner_mismatch");
    }

    state.buildings.delete(building.id);
    return okResult({
        building,
        populationUpdates: unregisterBuildingPopulation(state, building)
    });
};
