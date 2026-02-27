import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const countBuildingsForCity = (state: RuntimeState, cityId: number): number => {
    let total = 0;
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId) {
            total += 1;
        }
    }
    return total;
};

const findImmediateTargetCity = (state: RuntimeState, config: RuntimeConfig): number | null => {
    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        if (state.fakeCities.get(player.city)?.active) {
            continue;
        }
        if (countBuildingsForCity(state, player.city) >= config.rogueBuildingThreshold) {
            return player.city;
        }
    }
    return null;
};

const collectCandidateCityIds = (state: RuntimeState): Set<number> => {
    const candidateCityIds = new Set<number>();
    for (const cityId of state.cities.keys()) {
        candidateCityIds.add(cityId);
    }
    for (const building of state.buildings.values()) {
        candidateCityIds.add(building.cityId);
    }
    return candidateCityIds;
};

const chooseHighestScoreTarget = (
    state: RuntimeState,
    config: RuntimeConfig,
    candidateCityIds: Iterable<number>
): number | null => {
    let selected: number | null = null;
    let bestScore = -1;
    for (const cityId of candidateCityIds) {
        const city = state.cities.get(cityId);
        if (state.fakeCities.get(cityId)?.active) {
            continue;
        }
        if (countBuildingsForCity(state, cityId) < config.rogueBuildingThreshold) {
            continue;
        }
        const cityScore = city?.score ?? 0;
        if (cityScore <= bestScore) {
            continue;
        }
        selected = cityId;
        bestScore = cityScore;
    }
    return selected;
};

export const chooseRogueTargetCity = (state: RuntimeState, config: RuntimeConfig): number | null => {
    const immediateCity = findImmediateTargetCity(state, config);
    if (immediateCity !== null) {
        return immediateCity;
    }
    return chooseHighestScoreTarget(state, config, collectCandidateCityIds(state));
};
