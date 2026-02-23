import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { okResult, rejectResult, type CommandResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";
import { addCityScore, getOrCreateCity } from "../economy/CityEconomyService.js";
import { clearCityDefenses } from "../defense/DefenseService.js";

const resolveRank = (score: number): string => {
    if (score >= 2000) {
        return "commander";
    }
    if (score >= 1000) {
        return "captain";
    }
    if (score >= 500) {
        return "lieutenant";
    }
    return "recruit";
};

export type OrbDropResult = {
    cityOrbed: KnownEventPayloadByType["city.orbed"];
    scorePromotion: KnownEventPayloadByType["score.promotion"];
    removedBuildingIds: string[];
    removedHazardIds: string[];
    removedDefenseIds: string[];
};

export const dropOrb = (
    state: RuntimeState,
    actorId: string,
    payload: KnownEventPayloadByType["orb.drop.request"],
    config: RuntimeConfig
): CommandResult<OrbDropResult> => {
    if (payload.sourceCityId === payload.targetCityId) {
        return rejectResult("orb_invalid");
    }

    const source = getOrCreateCity(state, payload.sourceCityId, config);
    const target = getOrCreateCity(state, payload.targetCityId, config);
    if (source.orbCount <= 0) {
        return rejectResult("orb_invalid");
    }

    target.cash = config.cityStartingCash;
    target.researchLevel = 0;
    target.orbCount = 0;
    state.cities.set(target.cityId, target);

    const removedBuildingIds: string[] = [];
    for (const [buildingId, building] of state.buildings.entries()) {
        if (building.cityId === target.cityId) {
            state.buildings.delete(buildingId);
            removedBuildingIds.push(buildingId);
        }
    }
    const removedHazardIds: string[] = [];
    for (const [hazardId, hazard] of state.hazards.entries()) {
        if (hazard.cityId === target.cityId) {
            state.hazards.delete(hazardId);
            removedHazardIds.push(hazardId);
        }
    }
    const removedDefenseIds = clearCityDefenses(state, target.cityId);

    source.orbCount -= 1;
    const sourceAfterScore = addCityScore(state, source.cityId, config.orbScoreAward, config);
    const score = sourceAfterScore.score;
    const rank = resolveRank(score);

    return okResult({
        cityOrbed: {
            sourceCityId: source.cityId,
            targetCityId: target.cityId,
            by: actorId,
            awardedScore: config.orbScoreAward
        },
        scorePromotion: {
            cityId: source.cityId,
            score,
            rank
        },
        removedBuildingIds,
        removedHazardIds,
        removedDefenseIds
    });
};
