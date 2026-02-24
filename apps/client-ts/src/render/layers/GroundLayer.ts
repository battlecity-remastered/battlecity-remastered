import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;
const DRAW_RADIUS = 22;

export const renderGroundLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    texture: Texture | null = null
): void => {
    sprite.clear();
    const offsetX = state.local.x % TILE_SIZE;
    const offsetY = state.local.y % TILE_SIZE;

    for (let dx = -DRAW_RADIUS; dx <= DRAW_RADIUS; dx += 1) {
        for (let dy = -DRAW_RADIUS; dy <= DRAW_RADIUS; dy += 1) {
            const x = dx * TILE_SIZE - offsetX;
            const y = dy * TILE_SIZE - offsetY;
            if (texture) {
                sprite
                    .rect(x, y, TILE_SIZE, TILE_SIZE)
                    .fill({ texture });
            } else {
                const alternate = (dx + dy) % 3 === 0;
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
