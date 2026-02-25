import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const BUILDING_FOOTPRINT_TILES = 3;

const FACTORY_RESEARCH_REQUIREMENT: Readonly<Record<number, number>> = {
    100: 400,
    101: 401,
    102: 402,
    103: 403,
    104: 404,
    105: 405,
    106: 406,
    107: 407,
    108: 413,
    109: 409,
    110: 410,
    111: 411,
    112: 412
};

const isFactoryType = (type: number): boolean => {
    return Math.floor(type / 100) === 1;
};

const hasResearchRequirementSatisfied = (
    state: RuntimeState,
    cityId: number,
    buildingType: number
): boolean => {
    if (!isFactoryType(buildingType)) {
        return true;
    }

    const requiredResearch = FACTORY_RESEARCH_REQUIREMENT[buildingType];
    if (typeof requiredResearch !== "number") {
        return true;
    }

    const completed = state.research.get(cityId)?.completed ?? [];
    if (completed.includes(requiredResearch)) {
        return true;
    }

    for (const building of state.buildings.values()) {
        if (building.cityId === cityId && building.type === requiredResearch) {
            return true;
        }
    }
    return false;
};

const overlapsFootprint = (
    leftA: number,
    topA: number,
    leftB: number,
    topB: number
): boolean => {
    return leftA < (leftB + BUILDING_FOOTPRINT_TILES)
        && (leftA + BUILDING_FOOTPRINT_TILES) > leftB
        && topA < (topB + BUILDING_FOOTPRINT_TILES)
        && (topA + BUILDING_FOOTPRINT_TILES) > topB;
};

const footprintContains = (
    originX: number,
    originY: number,
    tileX: number,
    tileY: number
): boolean => {
    return tileX >= originX
        && tileX < (originX + BUILDING_FOOTPRINT_TILES)
        && tileY >= originY
        && tileY < (originY + BUILDING_FOOTPRINT_TILES);
};

const isOutOfBounds = (
    tileX: number,
    tileY: number,
    config: RuntimeConfig
): boolean => {
    const mapSizeTiles = Math.max(1, Math.floor(config.mapMax / config.tileSize));
    const maxTile = mapSizeTiles - 1;
    return tileX < 0
        || tileY < 0
        || (tileX + BUILDING_FOOTPRINT_TILES - 1) > maxTile
        || (tileY + BUILDING_FOOTPRINT_TILES - 1) > maxTile;
};

const hasBlockingTerrainFootprint = (
    state: RuntimeState,
    tileX: number,
    tileY: number
): boolean => {
    const blockingTiles = state.buildBlockingTiles.size > 0
        ? state.buildBlockingTiles
        : state.blockingTiles;
    for (let dx = 0; dx < BUILDING_FOOTPRINT_TILES; dx += 1) {
        for (let dy = 0; dy < BUILDING_FOOTPRINT_TILES; dy += 1) {
            if (blockingTiles.has(`${tileX + dx},${tileY + dy}`)) {
                return true;
            }
        }
    }
    return false;
};

const hasBlockingBuildingFootprint = (
    state: RuntimeState,
    tileX: number,
    tileY: number
): boolean => {
    for (const building of state.buildings.values()) {
        if (overlapsFootprint(tileX, tileY, building.tileX, building.tileY)) {
            return true;
        }
    }
    return false;
};

const hasBlockingDefenseFootprint = (
    state: RuntimeState,
    tileX: number,
    tileY: number
): boolean => {
    for (const defense of state.defenses.values()) {
        if (footprintContains(tileX, tileY, defense.tileX, defense.tileY)) {
            return true;
        }
    }
    return false;
};

export const canBuildInCity = (
    state: RuntimeState,
    cityId: number,
    tileX: number,
    tileY: number,
    config: RuntimeConfig
): "ok" | "collision" | "too_far" => {
    if (isOutOfBounds(tileX, tileY, config)) {
        return "collision";
    }
    if (hasBlockingTerrainFootprint(state, tileX, tileY)) {
        return "collision";
    }
    if (hasBlockingBuildingFootprint(state, tileX, tileY)) {
        return "collision";
    }
    if (hasBlockingDefenseFootprint(state, tileX, tileY)) {
        return "collision";
    }

    const cityBuildings = Array.from(state.buildings.values()).filter((building) => {
        return building.cityId === cityId;
    });

    if (cityBuildings.length === 0) {
        return "ok";
    }

    const hasChainAnchor = cityBuildings.some((building) => {
        const dx = Math.abs(building.tileX - tileX);
        const dy = Math.abs(building.tileY - tileY);
        return Math.max(dx, dy) <= config.maxBuildingChainDistanceTiles;
    });

    return hasChainAnchor ? "ok" : "too_far";
};

export const validateBuildResearch = (
    state: RuntimeState,
    cityId: number,
    buildingType: number
): boolean => {
    return hasResearchRequirementSatisfied(state, cityId, buildingType);
};
