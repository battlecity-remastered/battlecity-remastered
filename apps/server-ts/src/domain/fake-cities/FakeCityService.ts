import fakeCityConfig from "../../../data/fakeCities.json" with { type: "json" };
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

type FakeCityConfig = {
    cities?: Array<{ cityId?: number }>;
};

const config = fakeCityConfig as FakeCityConfig;

const toFiniteCityId = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return Math.max(0, Math.floor(value));
};

export const loadConfiguredFakeCityIds = (): number[] => {
    const ids: number[] = [];
    for (const entry of config.cities ?? []) {
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
    config: RuntimeConfig
): void => {
    const existing = state.fakeCities.get(cityId);
    state.fakeCities.set(cityId, {
        cityId,
        active: false,
        cooldownUntil: now + config.fakeCityCooldownMs
    });
    if (!existing?.active) {
        return;
    }
    for (const [botId, bot] of state.botControllers.entries()) {
        if (bot.homeCityId !== cityId) {
            continue;
        }
        state.botControllers.delete(botId);
        state.players.delete(botId);
    }
};

const countHumanPlayers = (state: RuntimeState): number => {
    let total = 0;
    for (const player of state.players.values()) {
        if (!player.isBot) {
            total += 1;
        }
    }
    return total;
};

export const tickFakeCityLifecycle = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    now: number
): { activated: number[]; deactivated: number[] } => {
    const activated: number[] = [];
    const deactivated: number[] = [];
    const lowPopulation = countHumanPlayers(state) <= runtimeConfig.fakeCityPlayerThreshold;

    for (const [cityId, fakeCity] of state.fakeCities.entries()) {
        const cooldownReady = now >= fakeCity.cooldownUntil;
        const shouldBeActive = lowPopulation && cooldownReady;
        if (shouldBeActive === fakeCity.active) {
            continue;
        }

        const next = {
            ...fakeCity,
            active: shouldBeActive
        };
        state.fakeCities.set(cityId, next);
        if (shouldBeActive) {
            activated.push(cityId);
        } else {
            deactivated.push(cityId);
            for (const [botId, bot] of state.botControllers.entries()) {
                if (bot.homeCityId !== cityId) {
                    continue;
                }
                state.botControllers.delete(botId);
                state.players.delete(botId);
            }
        }
    }

    return { activated, deactivated };
};
