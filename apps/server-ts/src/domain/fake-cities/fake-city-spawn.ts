import { isCommandCenterType } from "@battlecity/sim-core";
import type { RuntimeBuilding, RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { registerBuildingPopulation, unregisterBuildingPopulation } from "../population/PopulationService.js";
import { buildCityFinancePayload, getOrCreateCity } from "../economy/CityEconomyService.js";
import { deployDefenses } from "./fake-city-defense-deploy.js";
import { resolveFakeCityLayout } from "./fake-city-layout.js";
import { buildRandomDefensePlan } from "./fake-city-random-defense-plan.js";
import type { FakeCityConfigEntry, FakeCityLayoutEntry } from "./fake-city-model.js";
import {
    CITY_SPAWNS,
    FAKE_OWNER_PREFIX,
    asFiniteNumber,
    ensureFakeCityState,
    mapMaxTileFromConfig,
    removeCityBots,
    toFiniteCityId
} from "./fake-city-model.js";

const clearCityStructures = (
    state: RuntimeState,
    cityId: number,
    emitter: RuntimeEmitter,
    options: { reason: "cleared" | "city_orbed"; removeBots?: boolean }
): void => {
    const buildingsToRemove = Array.from(state.buildings.values()).filter((building) => building.cityId === cityId);
    for (const building of buildingsToRemove) {
        state.buildings.delete(building.id);
        const updates = unregisterBuildingPopulation(state, building);
        emitter.emit("building.demolished", {
            id: building.id,
            cityId
        });
        for (const update of updates) {
            emitter.emit("population.update", update);
        }
    }

    const hazardsToRemove = Array.from(state.hazards.values()).filter((hazard) => hazard.cityId === cityId);
    for (const hazard of hazardsToRemove) {
        state.hazards.delete(hazard.id);
        emitter.emit("hazard.remove", {
            id: hazard.id,
            reason: options.reason
        });
    }

    const defensesToRemove = Array.from(state.defenses.values()).filter((defense) => defense.cityId === cityId);
    for (const defense of defensesToRemove) {
        state.defenses.delete(defense.id);
        emitter.emit("defense.remove", {
            id: defense.id,
            reason: options.reason
        });
    }

    if (options.removeBots !== false) {
        removeCityBots(state, cityId);
    }
};

const spawnFakeCityBuildings = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    cityId: number,
    ownerId: string,
    baseTileX: number,
    baseTileY: number,
    layout: FakeCityLayoutEntry[]
): string[] => {
    const buildingIds: string[] = [];
    for (const blueprint of layout) {
        const type = asFiniteNumber(blueprint.type, Number.NaN);
        if (!Number.isFinite(type)) {
            continue;
        }
        const dx = asFiniteNumber(blueprint.dx, 0);
        const dy = asFiniteNumber(blueprint.dy, 0);
        const tileX = Math.floor(baseTileX + dx);
        const tileY = Math.floor(baseTileY + dy);
        state.seq += 1;
        const building: RuntimeBuilding = {
            id: `fake_building_${cityId}_${state.seq}`,
            ownerId,
            cityId,
            type,
            tileX,
            tileY,
            health: runtimeConfig.defaultBuildingHealth,
            maxHealth: runtimeConfig.defaultBuildingHealth,
            population: 0
        };
        state.buildings.set(building.id, building);
        buildingIds.push(building.id);
        emitter.emit("building.placed", {
            id: building.id,
            ownerId: building.ownerId,
            cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            health: building.health,
            maxHealth: building.maxHealth
        });
        const populationEvents = registerBuildingPopulation(state, building);
        for (const update of populationEvents) {
            emitter.emit("population.update", update);
        }
    }
    return buildingIds;
};

const spawnFakeCity = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    entry: FakeCityConfigEntry,
    now: number
): boolean => {
    const cityId = toFiniteCityId(entry.cityId);
    if (cityId === null) {
        return false;
    }

    const existingState = ensureFakeCityState(state, cityId);
    if (existingState.active || now < existingState.cooldownUntil) {
        return false;
    }

    const spawn = CITY_SPAWNS[String(cityId)];
    const baseTileX = Math.floor(asFiniteNumber(entry.baseTileX, asFiniteNumber(spawn?.tileX, 0)));
    const baseTileY = Math.floor(asFiniteNumber(entry.baseTileY, asFiniteNumber(spawn?.tileY, 0)));
    const layout = resolveFakeCityLayout(entry, spawn?.name);
    if (!layout.length) {
        return false;
    }

    clearCityStructures(state, cityId, emitter, {
        reason: "cleared",
        removeBots: false
    });

    const ownerId = `${FAKE_OWNER_PREFIX}${cityId}`;
    const buildingIds = spawnFakeCityBuildings(
        state,
        runtimeConfig,
        emitter,
        cityId,
        ownerId,
        baseTileX,
        baseTileY,
        layout
    );

    if (!buildingIds.length || !buildingIds.some((id) => {
        const building = state.buildings.get(id);
        return !!building && isCommandCenterType(building.type);
    })) {
        return false;
    }

    const allDefenses = buildRandomDefensePlan(state, runtimeConfig, baseTileX, baseTileY, layout);
    const defenseResult = deployDefenses(
        state,
        runtimeConfig,
        emitter,
        cityId,
        baseTileX,
        baseTileY,
        layout,
        ownerId,
        allDefenses
    );

    getOrCreateCity(state, cityId, runtimeConfig);
    state.fakeCities.set(cityId, {
        cityId,
        active: true,
        cooldownUntil: existingState.cooldownUntil,
        buildingIds,
        defenseIds: defenseResult.defenseIds,
        hazardIds: defenseResult.hazardIds,
        baseTileX,
        baseTileY
    });
    emitter.emit("city.finance", buildCityFinancePayload(state, cityId, runtimeConfig));

    return true;
};

const despawnFakeCity = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    cityId: number,
    runtimeConfig: RuntimeConfig
): boolean => {
    const existing = state.fakeCities.get(cityId);
    if (!existing || !existing.active) {
        return false;
    }

    clearCityStructures(state, cityId, emitter, {
        reason: "cleared"
    });

    state.fakeCities.set(cityId, {
        ...existing,
        active: false,
        buildingIds: [],
        defenseIds: [],
        hazardIds: []
    });
    emitter.emit("city.finance", buildCityFinancePayload(state, cityId, runtimeConfig));
    return true;
};

export const spawnFakeCities = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    count: number,
    configured: FakeCityConfigEntry[]
): number[] => {
    const createdIds: number[] = [];
    if (count <= 0) {
        return createdIds;
    }

    const available = configured.filter((entry) => {
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null) {
            return false;
        }
        const fakeCity = state.fakeCities.get(cityId);
        return !!fakeCity && !fakeCity.active && now >= fakeCity.cooldownUntil;
    });

    for (const entry of available) {
        if (createdIds.length >= count) {
            break;
        }
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null) {
            continue;
        }
        if (spawnFakeCity(state, runtimeConfig, emitter, entry, now)) {
            createdIds.push(cityId);
        }
    }

    return createdIds;
};

export const removeFakeCities = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    count: number
): number => {
    if (count <= 0) {
        return 0;
    }
    let removed = 0;
    const activeIds = Array.from(state.fakeCities.values())
        .filter((fakeCity) => fakeCity.active)
        .map((fakeCity) => fakeCity.cityId)
        .sort((a, b) => b - a);

    for (const cityId of activeIds) {
        if (removed >= count) {
            break;
        }
        if (despawnFakeCity(state, emitter, cityId, runtimeConfig)) {
            removed += 1;
        }
    }

    return removed;
};

export const clearCityStructuresForOrb = (
    state: RuntimeState,
    cityId: number,
    emitter: RuntimeEmitter
): void => {
    clearCityStructures(state, cityId, emitter, { reason: "city_orbed" });
};

export const mapMaxTile = mapMaxTileFromConfig;
