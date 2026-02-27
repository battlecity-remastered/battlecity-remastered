export type TileOrigin = {
    tileX: number;
    tileY: number;
};

export const BUILDING_FOOTPRINT_TILES = 3;

export const overlapsFootprint = (
    leftA: number,
    topA: number,
    leftB: number,
    topB: number,
    footprintTiles: number = BUILDING_FOOTPRINT_TILES
): boolean => {
    return leftA < (leftB + footprintTiles)
        && (leftA + footprintTiles) > leftB
        && topA < (topB + footprintTiles)
        && (topA + footprintTiles) > topB;
};

export const footprintContainsTile = (
    originX: number,
    originY: number,
    tileX: number,
    tileY: number,
    footprintTiles: number = BUILDING_FOOTPRINT_TILES
): boolean => {
    return tileX >= originX
        && tileX < (originX + footprintTiles)
        && tileY >= originY
        && tileY < (originY + footprintTiles);
};

export const hasOverlappingBuildingFootprint = (
    buildings: Iterable<TileOrigin>,
    tileX: number,
    tileY: number,
    footprintTiles: number = BUILDING_FOOTPRINT_TILES
): boolean => {
    for (const building of buildings) {
        if (overlapsFootprint(tileX, tileY, building.tileX, building.tileY, footprintTiles)) {
            return true;
        }
    }
    return false;
};

export const hasDefenseInFootprint = (
    defenses: Iterable<TileOrigin>,
    tileX: number,
    tileY: number,
    footprintTiles: number = BUILDING_FOOTPRINT_TILES
): boolean => {
    for (const defense of defenses) {
        if (footprintContainsTile(tileX, tileY, defense.tileX, defense.tileY, footprintTiles)) {
            return true;
        }
    }
    return false;
};
