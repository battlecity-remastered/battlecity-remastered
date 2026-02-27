import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import {
    EVAL_INTERVAL_MS,
    LOW_PLAYER_THRESHOLD,
    MIN_ORBABLE_CITIES,
    activeOrbableFakeCityCount,
    asFiniteNumber,
    countActiveFakeCities,
    countHumanPlayers,
    ensureFakeCityState,
    fakeCityConfig,
    getConfiguredCities,
    getConfiguredCitiesForState,
    nearestConfiguredCity,
    removeCityBots,
    resolveSoloPlayerCity,
    toFiniteCityId
} from "./fake-city-model.js";
import { removeFakeCities, spawnFakeCities } from "./fake-city-spawn.js";

export const loadConfiguredFakeCityIds = (): number[] => {
    const ids: number[] = [];
    for (const entry of getConfiguredCities()) {
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null || ids.includes(cityId)) {
            continue;
        }
        ids.push(cityId);
    }
    return ids;
};

export const markFakeCityCooldown = (
    state: RuntimeState,
    cityId: number,
    now: number,
    runtimeConfig: RuntimeConfig
): void => {
    const existing = ensureFakeCityState(state, cityId);
    state.fakeCities.set(cityId, {
        ...existing,
        cityId,
        active: false,
        cooldownUntil: now + runtimeConfig.fakeCityCooldownMs,
        buildingIds: [],
        defenseIds: [],
        hazardIds: []
    });
    removeCityBots(state, cityId);
    state.fakeCityEvaluationAt = 0;
};

const tryActivateSoloCity = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    configured: ReturnType<typeof getConfiguredCitiesForState>,
    now: number
): number | null => {
    if (countActiveFakeCities(state) !== 0) {
        return null;
    }
    const soloCity = resolveSoloPlayerCity(state);
    if (soloCity === null) {
        return null;
    }
    const nearby = nearestConfiguredCity(configured, soloCity, state, now);
    if (!nearby) {
        return null;
    }
    const ids = spawnFakeCities(state, runtimeConfig, emitter, now, 1, [nearby]);
    return ids[0] ?? null;
};

const resolveDesiredActiveFakeCities = (
    state: RuntimeState,
    humanCount: number,
    minPlayers: number,
    maxActive: number
): number => {
    const underThreshold = humanCount < minPlayers;
    let desired = underThreshold ? maxActive : 0;
    const orbableCount = activeOrbableFakeCityCount(state);
    if (orbableCount < MIN_ORBABLE_CITIES) {
        const needed = MIN_ORBABLE_CITIES - orbableCount;
        desired = Math.max(desired, Math.min(needed, maxActive));
    }
    return desired;
};

const appendActivatedCityIds = (target: number[], createdIds: number[]): void => {
    for (const cityId of createdIds) {
        if (!target.includes(cityId)) {
            target.push(cityId);
        }
    }
};

const resolveCitiesToDeactivate = (
    state: RuntimeState,
    activeCount: number,
    desired: number
): number[] => {
    const toRemove = activeCount - desired;
    return Array.from(state.fakeCities.values())
        .filter((fakeCity) => fakeCity.active)
        .map((fakeCity) => fakeCity.cityId)
        .sort((a, b) => b - a)
        .slice(0, toRemove);
};

const appendRemovedCityIds = (deactivated: number[], activeIds: number[], removed: number): void => {
    for (let index = 0; index < Math.min(removed, activeIds.length); index += 1) {
        deactivated.push(activeIds[index] as number);
    }
};

export const tickFakeCityLifecycle = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number
): { activated: number[]; deactivated: number[] } => {
    const activated: number[] = [];
    const deactivated: number[] = [];
    const configured = getConfiguredCitiesForState(state);
    if (!configured.length || now < state.fakeCityEvaluationAt) {
        return { activated, deactivated };
    }

    const intervalMs = Math.max(1000, asFiniteNumber(fakeCityConfig.evaluationIntervalMs, EVAL_INTERVAL_MS));
    state.fakeCityEvaluationAt = now + intervalMs;

    const humanCount = countHumanPlayers(state);
    const maxActive = Math.min(configured.length, Math.max(0, Math.floor(asFiniteNumber(fakeCityConfig.maxActive, configured.length))));
    const minPlayers = Math.max(LOW_PLAYER_THRESHOLD, Math.floor(asFiniteNumber(fakeCityConfig.minPlayers, LOW_PLAYER_THRESHOLD)));

    if (humanCount === 1) {
        const soloCityId = tryActivateSoloCity(state, runtimeConfig, emitter, configured, now);
        if (soloCityId !== null) {
            activated.push(soloCityId);
        }
    }

    const activeCount = countActiveFakeCities(state);
    const desired = resolveDesiredActiveFakeCities(state, humanCount, minPlayers, maxActive);

    if (desired > activeCount) {
        const createdIds = spawnFakeCities(state, runtimeConfig, emitter, now, desired - activeCount, configured);
        appendActivatedCityIds(activated, createdIds);
    }
    if (desired < activeCount) {
        const activeIds = resolveCitiesToDeactivate(state, activeCount, desired);
        const removed = removeFakeCities(state, runtimeConfig, emitter, activeCount - desired);
        appendRemovedCityIds(deactivated, activeIds, removed);
    }

    return { activated, deactivated };
};
