import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimeResearchState, type RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { getOrCreateCity, spendCityCash } from "../economy/CityEconomyService.js";

const ensureResearchState = (state: RuntimeState, cityId: number): RuntimeResearchState => {
    const existing = state.research.get(cityId);
    if (existing) {
        return existing;
    }
    const created: RuntimeResearchState = { completed: [] };
    state.research.set(cityId, created);
    return created;
};

const toPayload = (state: RuntimeState, cityId: number): KnownEventPayloadByType["research.update"] => {
    const research = ensureResearchState(state, cityId);
    return {
        cityId,
        active: research.active ? {
            researchType: research.active.researchType,
            remainingMs: research.active.remainingMs
        } : undefined,
        completed: [...research.completed]
    };
};

export const startResearch = (
    state: RuntimeState,
    cityId: number,
    researchType: number,
    config: RuntimeConfig
): CommandResult<KnownEventPayloadByType["research.update"]> => {
    const research = ensureResearchState(state, cityId);
    if (research.active) {
        return rejectResult("research_active");
    }
    if (research.completed.includes(researchType)) {
        return rejectResult("research_unavailable");
    }
    if (!spendCityCash(state, cityId, config.researchCost, config)) {
        return rejectResult("insufficient_funds");
    }

    research.active = {
        researchType,
        remainingMs: config.researchDurationMs
    };
    state.research.set(cityId, research);
    getOrCreateCity(state, cityId, config);
    return { ok: true, value: toPayload(state, cityId) };
};

export const tickResearch = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    for (const [cityId, research] of state.research.entries()) {
        if (!research.active) {
            continue;
        }
        research.active.remainingMs -= deltaMs;
        if (research.active.remainingMs > 0) {
            state.research.set(cityId, research);
            continue;
        }

        const completedType = research.active.researchType;
        const next: RuntimeResearchState = {
            completed: [...research.completed]
        };
        if (!research.completed.includes(completedType)) {
            next.completed.push(completedType);
        }

        const city = getOrCreateCity(state, cityId, config);
        city.researchLevel = next.completed.length;
        state.cities.set(cityId, city);
        state.research.set(cityId, next);
        emitter.emit("research.update", toPayload(state, cityId));
    }
};

export const emitResearchState = (state: RuntimeState, cityId: number, emitter: RuntimeEmitter): void => {
    emitter.emit("research.update", toPayload(state, cityId));
};
