import { Graphics, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 128;
const DRAW_RADIUS = 12;

export const renderGroundLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics
): void => {
    sprite.clear();
    const offsetX = state.local.x % TILE_SIZE;
    const offsetY = state.local.y % TILE_SIZE;

    for (let dx = -DRAW_RADIUS; dx <= DRAW_RADIUS; dx += 1) {
        for (let dy = -DRAW_RADIUS; dy <= DRAW_RADIUS; dy += 1) {
            const x = dx * TILE_SIZE - offsetX;
            const y = dy * TILE_SIZE - offsetY;
            const alternate = (dx + dy) % 2 === 0;
            sprite
                .rect(x, y, TILE_SIZE, TILE_SIZE)
                .fill(alternate ? 0x0e2432 : 0x102a39);
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
