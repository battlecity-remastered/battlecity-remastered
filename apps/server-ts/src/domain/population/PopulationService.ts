import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeBuilding, RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const POPULATION_MAX_HOUSE = 100;
const POPULATION_MAX_NON_HOUSE = 50;
const POPULATION_INCREMENT = 5;

const isHouseType = (type: number): boolean => {
    return Number.isFinite(type) && type >= 100 && Math.floor(type / 100) === 3;
};

const isPopulationProducer = (building: RuntimeBuilding): boolean => {
    return !isHouseType(building.type);
};

const emitShape = (
    building: RuntimeBuilding,
    removed: boolean
): KnownEventPayloadByType["population.update"] => {
    return {
        id: building.id,
        cityId: building.cityId,
        type: building.type,
        tileX: building.tileX,
        tileY: building.tileY,
        population: building.population,
        attachedHouseId: building.attachedHouseId,
        removed
    };
};

const getAttachedBuildings = (state: RuntimeState, houseId: string): RuntimeBuilding[] => {
    const attached: RuntimeBuilding[] = [];
    for (const building of state.buildings.values()) {
        if (building.attachedHouseId === houseId) {
            attached.push(building);
        }
    }
    return attached;
};

const findAttachableHouse = (state: RuntimeState, cityId: number): RuntimeBuilding | undefined => {
    let empty: RuntimeBuilding | undefined;
    for (const building of state.buildings.values()) {
        if (!isHouseType(building.type) || building.cityId !== cityId) {
            continue;
        }
        const attached = getAttachedBuildings(state, building.id).length;
        if (attached === 1) {
            return building;
        }
        if (attached === 0 && !empty) {
            empty = building;
        }
    }
    return empty;
};

const recomputeHousePopulation = (
    state: RuntimeState,
    house: RuntimeBuilding
): KnownEventPayloadByType["population.update"] | undefined => {
    const total = getAttachedBuildings(state, house.id).reduce((sum, building) => {
        return sum + building.population;
    }, 0);
    const nextPopulation = Math.min(POPULATION_MAX_HOUSE, total);
    if (house.population === nextPopulation) {
        return undefined;
    }
    house.population = nextPopulation;
    return emitShape(house, false);
};

const attachBuilding = (
    state: RuntimeState,
    building: RuntimeBuilding
): KnownEventPayloadByType["population.update"][] => {
    if (!isPopulationProducer(building)) {
        return [];
    }

    const house = findAttachableHouse(state, building.cityId);
    if (!house) {
        if (building.attachedHouseId || building.population > 0) {
            delete building.attachedHouseId;
            building.population = 0;
            return [emitShape(building, false)];
        }
        return [];
    }

    if (building.attachedHouseId === house.id) {
        return [];
    }

    building.attachedHouseId = house.id;
    const events: KnownEventPayloadByType["population.update"][] = [emitShape(building, false)];
    const houseUpdate = recomputeHousePopulation(state, house);
    if (houseUpdate) {
        events.push(houseUpdate);
    }
    return events;
};

const backfillHouseAttachments = (
    state: RuntimeState,
    house: RuntimeBuilding
): KnownEventPayloadByType["population.update"][] => {
    const events: KnownEventPayloadByType["population.update"][] = [];
    const attachedCount = getAttachedBuildings(state, house.id).length;
    if (attachedCount >= 2) {
        return events;
    }
    for (const building of state.buildings.values()) {
        if (!isPopulationProducer(building) || building.cityId !== house.cityId || building.attachedHouseId) {
            continue;
        }
        if (getAttachedBuildings(state, house.id).length >= 2) {
            break;
        }
        building.attachedHouseId = house.id;
        events.push(emitShape(building, false));
    }
    const houseUpdate = recomputeHousePopulation(state, house);
    if (houseUpdate) {
        events.push(houseUpdate);
    }
    return events;
};

export const registerBuildingPopulation = (
    state: RuntimeState,
    building: RuntimeBuilding
): KnownEventPayloadByType["population.update"][] => {
    building.population = 0;
    delete building.attachedHouseId;
    if (isHouseType(building.type)) {
        return [emitShape(building, false), ...backfillHouseAttachments(state, building)];
    }
    return [emitShape(building, false), ...attachBuilding(state, building)];
};

export const unregisterBuildingPopulation = (
    state: RuntimeState,
    building: RuntimeBuilding
): KnownEventPayloadByType["population.update"][] => {
    const events: KnownEventPayloadByType["population.update"][] = [];
    if (isHouseType(building.type)) {
        for (const attached of state.buildings.values()) {
            if (attached.attachedHouseId !== building.id) {
                continue;
            }
            delete attached.attachedHouseId;
            if (attached.population > 0) {
                attached.population = 0;
            }
            events.push(emitShape(attached, false));
            events.push(...attachBuilding(state, attached));
        }
    } else if (building.attachedHouseId) {
        const house = state.buildings.get(building.attachedHouseId);
        if (house && isHouseType(house.type)) {
            const houseUpdate = recomputeHousePopulation(state, house);
            if (houseUpdate) {
                events.push(houseUpdate);
            }
        }
    }
    events.push(emitShape(building, true));
    return events;
};

export const tickPopulation = (
    state: RuntimeState,
    config: RuntimeConfig,
    deltaMs: number
): KnownEventPayloadByType["population.update"][] => {
    state.populationTickAccumulatorMs += deltaMs;
    if (state.populationTickAccumulatorMs < config.populationTickMs) {
        return [];
    }
    state.populationTickAccumulatorMs = 0;

    const events: KnownEventPayloadByType["population.update"][] = [];
    for (const building of state.buildings.values()) {
        if (!isPopulationProducer(building)) {
            continue;
        }
        const house = building.attachedHouseId ? state.buildings.get(building.attachedHouseId) : undefined;
        if (!house || !isHouseType(house.type)) {
            if (building.population !== 0) {
                building.population = 0;
                events.push(emitShape(building, false));
            }
            continue;
        }
        const nextPopulation = Math.min(POPULATION_MAX_NON_HOUSE, building.population + POPULATION_INCREMENT);
        if (nextPopulation !== building.population) {
            building.population = nextPopulation;
            events.push(emitShape(building, false));
            const houseUpdate = recomputeHousePopulation(state, house);
            if (houseUpdate) {
                events.push(houseUpdate);
            }
        }
    }
    return events;
};
