export type TileEntity = {
    tileX: number;
    tileY: number;
};

export type PositionedEntity = {
    x: number;
    y: number;
};

export const hasTileEntityAt = (
    entities: Iterable<TileEntity>,
    tileX: number,
    tileY: number
): boolean => {
    for (const entity of entities) {
        if (entity.tileX === tileX && entity.tileY === tileY) {
            return true;
        }
    }
    return false;
};

export const hasPositionedEntityAtTile = (
    entities: Iterable<PositionedEntity>,
    tileX: number,
    tileY: number,
    tileSize: number
): boolean => {
    for (const entity of entities) {
        const entityTileX = Math.floor(entity.x / tileSize);
        const entityTileY = Math.floor(entity.y / tileSize);
        if (entityTileX === tileX && entityTileY === tileY) {
            return true;
        }
    }
    return false;
};
