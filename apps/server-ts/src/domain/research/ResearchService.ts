import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimeResearchState, type RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { emitCityFinance, getOrCreateCity, spendCityCash } from "../economy/CityEconomyService.js";

const RESEARCH_BUILDING_FAMILY = 4;
const RESEARCH_POPULATION_REQUIRED = 50;

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

const isResearchBuildingType = (type: number): boolean => {
    if (!Number.isFinite(type) || type < 100) {
        return false;
    }
    return Math.floor(type / 100) === RESEARCH_BUILDING_FAMILY;
};

const resolveEligibleResearchTypes = (
    state: RuntimeState,
    cityId: number
): number[] => {
    const eligible = new Set<number>();
    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId || !isResearchBuildingType(building.type)) {
            continue;
        }
        if (building.population < RESEARCH_POPULATION_REQUIRED) {
            continue;
        }
        eligible.add(building.type);
    }
    return [...eligible].sort((a, b) => a - b);
};

const updateAutoResearchState = (
    state: RuntimeState,
    cityId: number,
    config: RuntimeConfig,
    emitter: RuntimeEmitter
): boolean => {
    const research = ensureResearchState(state, cityId);
    let startedThisTick = false;

    if (research.active) {
        return startedThisTick;
    }

    const eligibleTypes = resolveEligibleResearchTypes(state, cityId);
    for (const researchType of eligibleTypes) {
        if (research.completed.includes(researchType)) {
            continue;
        }
        research.active = {
            researchType,
            remainingMs: config.researchDurationMs
        };
        state.research.set(cityId, research);
        emitter.emit("research.update", toPayload(state, cityId));
        startedThisTick = true;
        break;
    }

    return startedThisTick;
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
    const cityIds = new Set<number>();
    for (const cityId of state.research.keys()) {
        cityIds.add(cityId);
    }
    for (const building of state.buildings.values()) {
        if (!isResearchBuildingType(building.type) || building.population < RESEARCH_POPULATION_REQUIRED) {
            continue;
        }
        cityIds.add(building.cityId);
    }

    const startedThisTick = new Set<number>();
    for (const cityId of cityIds) {
        if (updateAutoResearchState(state, cityId, config, emitter)) {
            startedThisTick.add(cityId);
        }
    }

    for (const [cityId, research] of state.research.entries()) {
        if (!research.active) {
            continue;
        }
        if (startedThisTick.has(cityId)) {
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
        emitCityFinance(state, cityId, config, emitter);
    }
};

export const emitResearchState = (state: RuntimeState, cityId: number, emitter: RuntimeEmitter): void => {
    emitter.emit("research.update", toPayload(state, cityId));
};
