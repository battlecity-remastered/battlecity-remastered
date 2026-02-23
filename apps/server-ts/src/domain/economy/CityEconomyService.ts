import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeCity, RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const ensureCity = (state: RuntimeState, cityId: number, config: RuntimeConfig): RuntimeCity => {
    const existing = state.cities.get(cityId);
    if (existing) {
        return existing;
    }
    const city: RuntimeCity = {
        cityId,
        cash: config.cityStartingCash,
        income: config.cityBaseIncome,
        score: 0,
        researchLevel: 0,
        orbCount: 1
    };
    state.cities.set(cityId, city);
    return city;
};

const toFinancePayload = (city: RuntimeCity): KnownEventPayloadByType["city.finance"] => {
    return {
        cityId: city.cityId,
        cash: city.cash,
        income: city.income,
        score: city.score,
        researchLevel: city.researchLevel
    };
};

export const getOrCreateCity = (state: RuntimeState, cityId: number, config: RuntimeConfig): RuntimeCity => {
    return ensureCity(state, cityId, config);
};

export const spendCityCash = (
    state: RuntimeState,
    cityId: number,
    amount: number,
    config: RuntimeConfig
): boolean => {
    const city = ensureCity(state, cityId, config);
    if (city.cash < amount) {
        return false;
    }
    city.cash -= amount;
    state.cities.set(cityId, city);
    return true;
};

export const addCityScore = (state: RuntimeState, cityId: number, amount: number, config: RuntimeConfig): RuntimeCity => {
    const city = ensureCity(state, cityId, config);
    city.score += Math.max(0, Math.floor(amount));
    state.cities.set(cityId, city);
    return city;
};

export const emitCityFinance = (
    state: RuntimeState,
    cityId: number,
    config: RuntimeConfig,
    emitter: RuntimeEmitter
): void => {
    emitter.emit("city.finance", toFinancePayload(ensureCity(state, cityId, config)));
};

export const tickCityEconomy = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    state.economyTickAccumulatorMs += deltaMs;
    if (state.economyTickAccumulatorMs < 1000) {
        return;
    }
    state.economyTickAccumulatorMs = 0;

    for (let cityId = 0; cityId < config.cityCount; cityId += 1) {
        const city = ensureCity(state, cityId, config);
        const cityBuildings = Array.from(state.buildings.values()).filter((building) => building.cityId === cityId).length;
        city.income = config.cityBaseIncome + (cityBuildings * 2);
        city.cash += city.income;
        state.cities.set(cityId, city);
        emitter.emit("city.finance", toFinancePayload(city));
    }
};
