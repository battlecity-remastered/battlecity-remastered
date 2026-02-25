import type { LoadedMap } from "../../world/map-loader.js";

export const GROUND_TILE_SIZE = 128;
export const GROUND_TEXTURE_SIZE = 144;
export const GROUND_DRAW_MIN = -12;
export const GROUND_DRAW_MAX = 11;

export const TILE_SIZE = 48;
export const TILE_DRAW_RADIUS = 40;
const TILE_DRAW_MIN_RADIUS = 12;
const TILE_DRAW_OVERSCAN = 3;

const normalizeModulo = (value: number, divisor: number): number => {
    return ((value % divisor) + divisor) % divisor;
};

export const resolveGroundOrigin = (cameraX: number, cameraY: number): { x: number; y: number } => {
    const offX = normalizeModulo(cameraX, GROUND_TILE_SIZE);
    const offY = normalizeModulo(cameraY, GROUND_TILE_SIZE);
    return {
        x: cameraX - offX,
        y: cameraY - offY
    };
};

export const resolveTileDrawRadius = (worldSpanPixels: number): number => {
    if (!Number.isFinite(worldSpanPixels) || worldSpanPixels <= 0) {
        return TILE_DRAW_RADIUS;
    }
    const halfTiles = worldSpanPixels / TILE_SIZE / 2;
    return Math.max(TILE_DRAW_MIN_RADIUS, Math.ceil(halfTiles) + TILE_DRAW_OVERSCAN);
};

const isInsideMap = (mapData: LoadedMap, tileX: number, tileY: number): boolean => {
    return tileX >= 0 && tileY >= 0 && tileX < mapData.map.length && tileY < mapData.map.length;
};

export const resolveTerrainFrameOffset = (mapData: LoadedMap, tileX: number, tileY: number, tileValue: number): number => {
    const same = (x: number, y: number): boolean => {
        if (!isInsideMap(mapData, x, y)) {
            return false;
        }
        return (mapData.map[x]?.[y] ?? 0) === tileValue;
    };

    const isLeft = same(tileX - 1, tileY) ? 0 : 1;
    const isRight = same(tileX + 1, tileY) ? 0 : 1;
    const isDown = same(tileX, tileY + 1) ? 0 : 1;
    const isUp = same(tileX, tileY - 1) ? 0 : 1;
    return (isLeft + (isRight * 2) + (isDown * 4) + (isUp * 8)) * TILE_SIZE;
};
