import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { okResult, rejectResult, type CommandResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";
import { addCityScore, getOrCreateCity } from "../economy/CityEconomyService.js";
import { clearCityDefenses } from "../defense/DefenseService.js";
import { resolveRankTitle } from "../score/RankService.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";
import citySpawnsJson from "../../../data/citySpawns.json" with { type: "json" };

const ITEM_TYPE_ORB = 5;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;

type CitySpawnEntry = {
    tileX?: number;
    tileY?: number;
};

const CITY_SPAWNS = citySpawnsJson as Record<string, CitySpawnEntry>;

const resolveRank = (score: number): string => {
    return resolveRankTitle(score);
};

export type OrbDropResult = {
    cityOrbed: KnownEventPayloadByType["city.orbed"];
    scorePromotion: KnownEventPayloadByType["score.promotion"];
    removedBuildingIds: string[];
    removedHazardIds: string[];
    removedDefenseIds: string[];
    inventory: KnownEventPayloadByType["inventory.update"];
};

const hasCommandCenter = (state: RuntimeState, cityId: number): boolean => {
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId && building.type === 0) {
            return true;
        }
    }
    return false;
};

const resolveTargetCityFromDropPosition = (
    payload: KnownEventPayloadByType["orb.drop.request"],
    config: RuntimeConfig
): number | null => {
    const position = payload.position;
    if (!position) {
        return null;
    }
    const rawX = Number(position.x);
    const rawY = Number(position.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
        return null;
    }

    const centerX = rawX + (config.tileSize / 2);
    const centerY = rawY + (config.tileSize / 2);
    let bestCityId: number | null = null;
    let bestDistanceSq = Number.POSITIVE_INFINITY;

    for (const [cityIdRaw, spawn] of Object.entries(CITY_SPAWNS)) {
        const cityId = Number(cityIdRaw);
        if (!Number.isFinite(cityId)) {
            continue;
        }
        if (cityId === payload.sourceCityId) {
            continue;
        }
        const tileX = Number(spawn?.tileX);
        const tileY = Number(spawn?.tileY);
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            continue;
        }

        const rectX = Math.floor(tileX) * config.tileSize;
        const rectY = (Math.floor(tileY) + COMMAND_CENTER_HEIGHT_TILES) * config.tileSize;
        const rectWidth = COMMAND_CENTER_WIDTH_TILES * config.tileSize;
        const rectHeight = config.tileSize;
        const rectRight = rectX + rectWidth;
        const rectBottom = rectY + rectHeight;
        if (centerX < rectX || centerX > rectRight || centerY < rectY || centerY > rectBottom) {
            continue;
        }

        const clampedX = Math.max(rectX, Math.min(centerX, rectRight));
        const clampedY = Math.max(rectY, Math.min(centerY, rectBottom));
        const dx = centerX - clampedX;
        const dy = centerY - clampedY;
        const distanceSq = (dx * dx) + (dy * dy);
        if (distanceSq < bestDistanceSq) {
            bestDistanceSq = distanceSq;
            bestCityId = Math.floor(cityId);
        }
    }

    return bestCityId;
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

    const resolvedTargetCityId = resolveTargetCityFromDropPosition(payload, config);
    if (resolvedTargetCityId === null || resolvedTargetCityId !== payload.targetCityId) {
        return rejectResult("orb_invalid");
    }
    if (!hasCommandCenter(state, resolvedTargetCityId)) {
        return rejectResult("orb_invalid");
    }

    const consumedOrb = consumeInventoryItem(state, actorId, ITEM_TYPE_ORB);
    if (!consumedOrb.ok) {
        return rejectResult(consumedOrb.reason);
    }

    const source = getOrCreateCity(state, payload.sourceCityId, config);
    const target = getOrCreateCity(state, resolvedTargetCityId, config);

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

    source.orbCount = Math.max(0, source.orbCount - 1);
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
        removedDefenseIds,
        inventory: consumedOrb.value
    });
};
