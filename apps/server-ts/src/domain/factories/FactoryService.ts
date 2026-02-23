import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";

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

    for (let cityId = 0; cityId < config.cityCount; cityId += 1) {
        const cityStock = ensureCityStock(state, cityId);
        const stock = cityStock.get(0) ?? 0;
        const next = Math.min(config.factoryStockCap, stock + 1);
        cityStock.set(0, next);
        state.factoryStock.set(cityId, cityStock);
        emitter.emit("factory.stock", toPayload(cityId, 0, next));
    }
};
