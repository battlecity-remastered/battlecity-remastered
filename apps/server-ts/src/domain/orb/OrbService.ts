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

type DropCenter = {
    x: number;
    y: number;
};

type CommandCenterRect = {
    left: number;
    right: number;
    top: number;
    bottom: number;
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

const resolveDropCenter = (
    payload: KnownEventPayloadByType["orb.drop.request"],
    config: RuntimeConfig
): DropCenter | null => {
    const position = payload.position;
    if (!position) {
        return null;
    }
    const rawX = Number(position.x);
    const rawY = Number(position.y);
    if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) {
        return null;
    }
    return {
        x: rawX + (config.tileSize / 2),
        y: rawY + (config.tileSize / 2)
    };
};

const resolveSpawnTile = (value: number | undefined): number | null => {
    const tile = Number(value);
    return Number.isFinite(tile) ? Math.floor(tile) : null;
};

const resolveCommandCenterRect = (
    spawn: CitySpawnEntry,
    config: RuntimeConfig
): CommandCenterRect | null => {
    const tileX = resolveSpawnTile(spawn?.tileX);
    const tileY = resolveSpawnTile(spawn?.tileY);
    if (tileX === null || tileY === null) {
        return null;
    }
    const left = tileX * config.tileSize;
    const top = (tileY + COMMAND_CENTER_HEIGHT_TILES) * config.tileSize;
    return {
        left,
        top,
        right: left + (COMMAND_CENTER_WIDTH_TILES * config.tileSize),
        bottom: top + config.tileSize
    };
};

const isInsideRect = (point: DropCenter, rect: CommandCenterRect): boolean => {
    return point.x >= rect.left
        && point.x <= rect.right
        && point.y >= rect.top
        && point.y <= rect.bottom;
};

const distanceSqToRect = (point: DropCenter, rect: CommandCenterRect): number => {
    const clampedX = Math.max(rect.left, Math.min(point.x, rect.right));
    const clampedY = Math.max(rect.top, Math.min(point.y, rect.bottom));
    const dx = point.x - clampedX;
    const dy = point.y - clampedY;
    return (dx * dx) + (dy * dy);
};

const resolveTargetCityFromDropPosition = (
    payload: KnownEventPayloadByType["orb.drop.request"],
    config: RuntimeConfig
): number | null => {
    const center = resolveDropCenter(payload, config);
    if (!center) {
        return null;
    }

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
        const rect = resolveCommandCenterRect(spawn, config);
        if (!rect || !isInsideRect(center, rect)) {
            continue;
        }

        const distanceSq = distanceSqToRect(center, rect);
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
