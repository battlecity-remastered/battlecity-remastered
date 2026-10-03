import { isCommandCenterType } from "@battlecity/sim-core";
import type { RuntimeCity, RuntimeConfig, RuntimeState } from "../../runtime/types.js";

// Historic peak and factory flags survive demolition, until the city resets.
export const refreshCityOrbHistory = (state: RuntimeState, city: RuntimeCity): boolean => {
    let count = 1, hasCommandCenter = false;
    for (const building of state.buildings.values()) {
        if (building.cityId !== city.cityId) continue;
        if (isCommandCenterType(building.type)) hasCommandCenter = true;
        else count += 1;
        if (building.type === 103) city.hadBombFactory = true;
        if (building.type === 105) city.hadOrbFactory = true;
    }
    city.maxBuildings = Math.max(city.maxBuildings ?? 1, count);
    return hasCommandCenter;
};

export const isCityOrbable = (state: RuntimeState, city: RuntimeCity): boolean => {
    const hasCommandCenter = refreshCityOrbHistory(state, city);
    return hasCommandCenter && !!(city.hadBombFactory || city.hadOrbFactory || (city.maxBuildings ?? 1) >= 21);
};

const baseOrbBounty = (city: RuntimeCity): number => {
    const peak = city.maxBuildings ?? 1;
    if (peak >= 31) return 50;
    if (peak >= 26) return 40;
    if (peak >= 21) return 30;
    if (city.hadOrbFactory) return 20;
    if (city.hadBombFactory) return 10;
    return 0;
};

export const cityOrbBounty = (city: RuntimeCity): number => {
    return baseOrbBounty(city) + Math.max(0, city.orbVictories ?? 0) * 5;
};

export const resetCityAfterOrb = (state: RuntimeState, city: RuntimeCity, config: RuntimeConfig): void => {
    city.cash = config.cityStartingCash;
    city.income = 0;
    city.score = 0;
    city.researchLevel = 0;
    city.orbCount = 0;
    city.maxBuildings = 1;
    city.hadBombFactory = false;
    city.hadOrbFactory = false;
    city.orbVictories = 0;
    state.research.delete(city.cityId);
    state.factoryStock.delete(city.cityId);
};
