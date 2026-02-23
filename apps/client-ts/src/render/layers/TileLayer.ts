import { Graphics, type Container } from "pixi.js";
import type { LoadedMap } from "../../world/map-loader.js";

const TILE_SIZE = 48;
const DRAW_RADIUS = 20;

const terrainColor = (tileValue: number): number | null => {
    if (tileValue === 2) {
        return 0x8a6742;
    }
    if (tileValue === 3) {
        return 0xaa5533;
    }
    return null;
};

export const renderTileLayer = (
    mapData: LoadedMap,
    cameraX: number,
    cameraY: number,
    layer: Container,
    sprite: Graphics
): void => {
    sprite.clear();
    const centerTileX = Math.floor(cameraX / TILE_SIZE);
    const centerTileY = Math.floor(cameraY / TILE_SIZE);

    for (let tx = centerTileX - DRAW_RADIUS; tx <= centerTileX + DRAW_RADIUS; tx += 1) {
        for (let ty = centerTileY - DRAW_RADIUS; ty <= centerTileY + DRAW_RADIUS; ty += 1) {
            if (tx < 0 || ty < 0 || tx >= mapData.map.length || ty >= mapData.map.length) {
                continue;
            }
            const value = mapData.map[tx]?.[ty] ?? 0;
            const fill = terrainColor(value);
            if (fill === null) {
                continue;
            }
            sprite
                .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                .fill(fill);
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
