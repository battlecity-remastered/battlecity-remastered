import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;
const DRAW_RADIUS = 24;

export const renderGroundLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    texture: Texture | null = null
): void => {
    sprite.clear();
    const centerTileX = Math.floor(state.local.x / TILE_SIZE);
    const centerTileY = Math.floor(state.local.y / TILE_SIZE);

    for (let tx = centerTileX - DRAW_RADIUS; tx <= centerTileX + DRAW_RADIUS; tx += 1) {
        for (let ty = centerTileY - DRAW_RADIUS; ty <= centerTileY + DRAW_RADIUS; ty += 1) {
            const x = tx * TILE_SIZE;
            const y = ty * TILE_SIZE;
            if (texture) {
                sprite
                    .rect(x, y, TILE_SIZE, TILE_SIZE)
                    .fill({ texture });
            } else {
                const alternate = (tx + ty) % 3 === 0;
                sprite
                    .rect(x, y, TILE_SIZE, TILE_SIZE)
                    .fill(alternate ? 0x1a2e27 : 0x20362d);
            }
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
