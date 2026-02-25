import {
    ITEM_TYPE_DFG,
    ITEM_TYPE_MINE
} from "../parity/constants.js";

const HIDDEN_ENEMY_PROXIMITY_HAZARD_TYPES = new Set<number>([ITEM_TYPE_MINE, ITEM_TYPE_DFG]);

type HazardVisibilityState = {
    cityId: number;
    type: number;
    armed?: boolean;
    active?: boolean;
};

export const isHiddenEnemyProximityHazard = (
    localCityId: number,
    hazard: HazardVisibilityState
): boolean => {
    const isActive = typeof hazard.active === "boolean"
        ? hazard.active
        : hazard.armed !== false;
    return HIDDEN_ENEMY_PROXIMITY_HAZARD_TYPES.has(hazard.type)
        && hazard.cityId !== localCityId
        && isActive;
};
