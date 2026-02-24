import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import {
    GROUND_DRAW_MAX,
    GROUND_DRAW_MIN,
    GROUND_TILE_SIZE,
    resolveGroundOrigin
} from "./terrain-parity-helpers.js";

export const renderGroundLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    texture: Texture | null = null
): void => {
    sprite.clear();
    const origin = resolveGroundOrigin(state.local.x, state.local.y);

    for (let tx = GROUND_DRAW_MIN; tx <= GROUND_DRAW_MAX; tx += 1) {
        for (let ty = GROUND_DRAW_MIN; ty <= GROUND_DRAW_MAX; ty += 1) {
            const x = origin.x + (tx * GROUND_TILE_SIZE);
            const y = origin.y + (ty * GROUND_TILE_SIZE);
            if (texture) {
                sprite
                    .rect(x, y, GROUND_TILE_SIZE, GROUND_TILE_SIZE)
                    .fill({ texture });
            } else {
                const alternate = (tx + ty) % 3 === 0;
                sprite
                    .rect(x, y, GROUND_TILE_SIZE, GROUND_TILE_SIZE)
                    .fill(alternate ? 0x1a2e27 : 0x20362d);
            }
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
