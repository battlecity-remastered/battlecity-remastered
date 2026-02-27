const BUILDING_FOOTPRINT_TILES = 3;

export const resolveBuildingBlockingHeightTiles = (
    buildingType: number,
    reducedHeightTiles = 2
): number => {
    if (!Number.isFinite(buildingType)) {
        return BUILDING_FOOTPRINT_TILES;
    }
    if (buildingType === 0) {
        return reducedHeightTiles;
    }
    if (buildingType >= 100) {
        const family = Math.floor(buildingType / 100);
        return family <= 2 ? reducedHeightTiles : BUILDING_FOOTPRINT_TILES;
    }
    return BUILDING_FOOTPRINT_TILES;
};
