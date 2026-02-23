import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

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
    return completed.includes(requiredResearch);
};

export const canBuildInCity = (
    state: RuntimeState,
    cityId: number,
    tileX: number,
    tileY: number,
    config: RuntimeConfig
): "ok" | "collision" | "too_far" => {
    const cityBuildings = Array.from(state.buildings.values()).filter((building) => {
        return building.cityId === cityId;
    });

    const collided = cityBuildings.some((building) => {
        return building.tileX === tileX && building.tileY === tileY;
    });
    if (collided) {
        return "collision";
    }

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

