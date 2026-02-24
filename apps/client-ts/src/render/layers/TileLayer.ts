import { Graphics, type Container, type Texture } from "pixi.js";
import type { LoadedMap } from "../../world/map-loader.js";

const TILE_SIZE = 48;
const DRAW_RADIUS = 20;

const terrainColor = (tileValue: number): number | null => (tileValue === 2 ? 0x7e6746 : tileValue === 3 ? 0x6b5a45 : null);

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
            if (tx < 0 || ty < 0 || tx >= mapData.map.length || ty >= mapData.map.length) {
                continue;
            }
            const value = mapData.map[tx]?.[ty] ?? 0;
            const texture = value === 2 ? rockTexture : value === 3 ? lavaTexture : null;
            if (texture) {
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill({ texture })
                    .stroke({ color: 0x2d261d, width: 1, alpha: 0.45 });
            } else {
                const fill = terrainColor(value);
                if (fill === null) {
                    continue;
                }
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill(fill)
                    .stroke({ color: 0x2d261d, width: 1, alpha: 0.45 });
            }
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
