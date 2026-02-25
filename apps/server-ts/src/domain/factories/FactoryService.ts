import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeBuilding, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";

const POPULATION_MAX_NON_HOUSE = 50;
const FACTORY_ITEM_LIMITS: Readonly<Record<number, number>> = {
    100: 4,
    101: 4,
    102: 20,
    103: 20,
    104: 10,
    105: 1,
    106: 4,
    107: 5,
    108: 20,
    109: 10,
    110: 5,
    111: 5,
    112: 4
};

const ensureCityStock = (state: RuntimeState, cityId: number): Map<number, number> => {
    const existing = state.factoryStock.get(cityId);
    if (existing) {
        return existing;
    }
    const created = new Map<number, number>();
    state.factoryStock.set(cityId, created);
    return created;
};

const toPayload = (cityId: number, itemType: number, stock: number): KnownEventPayloadByType["factory.stock"] => {
    return { cityId, itemType, stock };
};

const normalizeCount = (value: number | undefined): number => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.floor(value));
};

const resolveFactoryStockCount = (state: RuntimeState, cityId: number, itemType: number): number => {
    const cityStock = state.factoryStock.get(cityId);
    return normalizeCount(cityStock?.get(itemType));
};

const resolvePlayerHeldCount = (state: RuntimeState, cityId: number, itemType: number): number => {
    let total = 0;
    for (const [socketId, inventory] of state.playerInventory.entries()) {
        if (state.socketCities.get(socketId) !== cityId) {
            continue;
        }
        total += normalizeCount(inventory.get(itemType));
    }
    return total;
};

const resolveHazardCount = (state: RuntimeState, cityId: number, itemType: number): number => {
    let total = 0;
    for (const hazard of state.hazards.values()) {
        if (hazard.cityId !== cityId || hazard.type !== itemType) {
            continue;
        }
        total += 1;
    }
    return total;
};

const resolveDefenseCount = (state: RuntimeState, cityId: number, itemType: number): number => {
    let total = 0;
    for (const defense of state.defenses.values()) {
        if (defense.cityId !== cityId || defense.type !== itemType) {
            continue;
        }
        total += 1;
    }
    return total;
};

const resolveCityOutstandingItemCount = (state: RuntimeState, cityId: number, itemType: number): number => {
    return resolveFactoryStockCount(state, cityId, itemType)
        + resolvePlayerHeldCount(state, cityId, itemType)
        + resolveHazardCount(state, cityId, itemType)
        + resolveDefenseCount(state, cityId, itemType);
};

const isFactoryBuildingType = (type: number): boolean => {
    return Math.floor(type / 100) === 1;
};

const addActiveFactoryItemType = (
    activeFactoryItemTypes: Map<number, Set<number>>,
    cityId: number,
    itemType: number
): void => {
    const cityItems = activeFactoryItemTypes.get(cityId) ?? new Set<number>();
    cityItems.add(itemType);
    activeFactoryItemTypes.set(cityId, cityItems);
};

const resolveFactoryCap = (
    config: RuntimeConfig,
    buildingType: number
): number => {
    const buildingLimit = FACTORY_ITEM_LIMITS[buildingType] ?? config.factoryStockCap;
    return Math.max(0, Math.min(config.factoryStockCap, buildingLimit));
};

const tryProduceFactoryStock = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    cityId: number,
    buildingType: number,
    itemType: number
): void => {
    const cityStock = ensureCityStock(state, cityId);
    const current = cityStock.get(itemType) ?? 0;
    const cap = resolveFactoryCap(config, buildingType);
    const outstanding = resolveCityOutstandingItemCount(state, cityId, itemType);
    if (outstanding >= cap) {
        return;
    }

    const next = current + 1;
    cityStock.set(itemType, next);
    state.factoryStock.set(cityId, cityStock);
    emitter.emit("factory.stock", toPayload(cityId, itemType, next));
};

const processFactoryBuilding = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    activeFactoryItemTypes: Map<number, Set<number>>,
    building: RuntimeBuilding
): void => {
    if (!isFactoryBuildingType(building.type)) {
        return;
    }
    const cityId = building.cityId;
    const itemType = building.type % 100;
    addActiveFactoryItemType(activeFactoryItemTypes, cityId, itemType);
    if (building.population < POPULATION_MAX_NON_HOUSE) {
        return;
    }
    tryProduceFactoryStock(state, config, emitter, cityId, building.type, itemType);
};

const clearInactiveFactoryStock = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    activeFactoryItemTypes: Map<number, Set<number>>
): void => {
    for (const [cityId, cityStock] of state.factoryStock.entries()) {
        const cityItems = activeFactoryItemTypes.get(cityId) ?? new Set<number>();
        for (const [itemType, stock] of cityStock.entries()) {
            if (stock <= 0 || cityItems.has(itemType)) {
                continue;
            }
            cityStock.set(itemType, 0);
            emitter.emit("factory.stock", toPayload(cityId, itemType, 0));
        }
    }
};

export const collectFactoryStock = (
    state: RuntimeState,
    cityId: number,
    itemType: number,
    amount: number
): CommandResult<KnownEventPayloadByType["factory.stock"]> => {
    const cityStock = ensureCityStock(state, cityId);
    const current = cityStock.get(itemType) ?? 0;
    const take = Math.max(1, Math.floor(amount));
    if (current < take) {
        return rejectResult("factory_empty");
    }
    const next = current - take;
    cityStock.set(itemType, next);
    state.factoryStock.set(cityId, cityStock);
    return { ok: true, value: toPayload(cityId, itemType, next) };
};

export const restoreFactoryStock = (
    state: RuntimeState,
    cityId: number,
    itemType: number,
    amount = 1
): KnownEventPayloadByType["factory.stock"] => {
    const cityStock = ensureCityStock(state, cityId);
    const current = cityStock.get(itemType) ?? 0;
    const restore = Math.max(1, Math.floor(amount));
    const next = current + restore;
    cityStock.set(itemType, next);
    state.factoryStock.set(cityId, cityStock);
    return toPayload(cityId, itemType, next);
};

export const tickFactories = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    state.factoryTickAccumulatorMs += deltaMs;
    if (state.factoryTickAccumulatorMs < config.factoryProductionTickMs) {
        return;
    }
    state.factoryTickAccumulatorMs = 0;

    const activeFactoryItemTypes = new Map<number, Set<number>>();

    for (const building of state.buildings.values()) {
        processFactoryBuilding(state, config, emitter, activeFactoryItemTypes, building);
    }

    clearInactiveFactoryStock(state, emitter, activeFactoryItemTypes);
};
