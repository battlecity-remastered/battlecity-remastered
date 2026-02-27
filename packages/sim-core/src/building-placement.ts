export type PlacementBuilding = {
    type: number;
    tileX: number;
    tileY: number;
};

const COMMAND_CENTER_BUILDING_TYPE = 0;
const BUILDING_FOOTPRINT_TILES = 3;

export const resolveBuildingBaseType = (buildingType: number): number => {
    const numeric = Number(buildingType);
    if (!Number.isFinite(numeric)) {
        return -1;
    }
    if (numeric === 0) {
        return 0;
    }
    if (numeric < 100) {
        return -1;
    }
    return Math.floor(numeric / 100);
};

export const isFactoryType = (buildingType: number): boolean => {
    return resolveBuildingBaseType(buildingType) === 1;
};

export const isCommandCenterType = (buildingType: number): boolean => {
    return Number(buildingType) === COMMAND_CENTER_BUILDING_TYPE;
};

export const isHospitalType = (buildingType: number): boolean => {
    const numeric = Number(buildingType);
    const family = Math.floor(numeric / 100);
    return numeric === 300 || numeric === 301 || (family === 2 && numeric >= 200 && numeric < 300);
};

export const isTileWithinBuildingFootprint = (
    tileX: number,
    tileY: number,
    building: PlacementBuilding
): boolean => {
    return tileX >= building.tileX
        && tileX <= (building.tileX + BUILDING_FOOTPRINT_TILES - 1)
        && tileY >= building.tileY
        && tileY <= (building.tileY + BUILDING_FOOTPRINT_TILES - 1);
};

export const isPlacementAllowedOnBuilding = (
    tileX: number,
    tileY: number,
    building: PlacementBuilding
): boolean => {
    const minX = building.tileX;
    const maxX = building.tileX + BUILDING_FOOTPRINT_TILES - 1;
    const pickupY = building.tileY + BUILDING_FOOTPRINT_TILES - 1;

    if (isFactoryType(building.type)) {
        return tileY === pickupY && tileX >= minX && tileX <= maxX;
    }

    if (isCommandCenterType(building.type) || isHospitalType(building.type)) {
        return tileY === pickupY && tileX >= minX && tileX <= maxX;
    }

    return false;
};

export const hasCommandCenterBuilding = (
    buildings: Iterable<PlacementBuilding & { cityId: number }>,
    cityId: number
): boolean => {
    for (const building of buildings) {
        if (building.cityId === cityId && isCommandCenterType(building.type)) {
            return true;
        }
    }
    return false;
};

export const hasBlockingBuildingAtTile = (
    buildings: Iterable<PlacementBuilding>,
    tileX: number,
    tileY: number
): boolean => {
    for (const building of buildings) {
        if (!isTileWithinBuildingFootprint(tileX, tileY, building)) {
            continue;
        }
        if (!isPlacementAllowedOnBuilding(tileX, tileY, building)) {
            return true;
        }
    }
    return false;
};
