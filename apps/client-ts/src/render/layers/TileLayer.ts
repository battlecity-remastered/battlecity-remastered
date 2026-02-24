import { Graphics, type Container, type Texture } from "pixi.js";
import type { LoadedMap } from "../../world/map-loader.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";

const TILE_SIZE = 48;
const DRAW_RADIUS = 40;
const MAP_SQUARE_LAVA = 1;
const MAP_SQUARE_ROCK = 2;

const terrainColor = (tileValue: number): number | null => {
    if (tileValue === MAP_SQUARE_ROCK) {
        return 0x7e6746;
    }
    if (tileValue === MAP_SQUARE_LAVA) {
        return 0x6b5a45;
    }
    return null;
};

const isInsideMap = (mapData: LoadedMap, tileX: number, tileY: number): boolean => {
    return tileX >= 0 && tileY >= 0 && tileX < mapData.map.length && tileY < mapData.map.length;
};

const resolveTerrainFrameOffset = (mapData: LoadedMap, tileX: number, tileY: number, tileValue: number): number => {
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

export const renderTileLayer = (
    mapData: LoadedMap,
    cameraX: number,
    cameraY: number,
    layer: Container,
    sprite: Graphics,
    rockTexture: Texture | null = null,
    lavaTexture: Texture | null = null
): void => {
    sprite.clear();
    const centerTileX = Math.floor(cameraX / TILE_SIZE);
    const centerTileY = Math.floor(cameraY / TILE_SIZE);

    for (let tx = centerTileX - DRAW_RADIUS; tx <= centerTileX + DRAW_RADIUS; tx += 1) {
        for (let ty = centerTileY - DRAW_RADIUS; ty <= centerTileY + DRAW_RADIUS; ty += 1) {
            if (!isInsideMap(mapData, tx, ty)) {
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill(0x000000);
                continue;
            }
            const value = mapData.map[tx]?.[ty] ?? 0;
            const baseTexture = value === MAP_SQUARE_ROCK ? rockTexture : value === MAP_SQUARE_LAVA ? lavaTexture : null;
            if (baseTexture) {
                const frameOffset = resolveTerrainFrameOffset(mapData, tx, ty, value);
                const frame = getFrameTexture(
                    baseTexture,
                    `terrain:${value}:${frameOffset}`,
                    frameOffset,
                    0,
                    TILE_SIZE,
                    TILE_SIZE
                );
                if (!frame) {
                    continue;
                }
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill({ texture: frame });
            } else {
                const fill = terrainColor(value);
                if (fill === null) {
                    continue;
                }
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill(fill);
            }
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
