import { Graphics, type Container, type Texture } from "pixi.js";
import {
    GROUND_DRAW_MAX,
    GROUND_DRAW_MIN,
    GROUND_TILE_SIZE,
    GROUND_TEXTURE_SIZE,
    resolveGroundOrigin
} from "./terrain-parity-helpers.js";

type GroundLayerRuntime = {
    lastOriginX: number | null;
    lastOriginY: number | null;
    lastTextureUid: number;
};

const runtimeBySprite = new WeakMap<Graphics, GroundLayerRuntime>();

const ensureGroundRuntime = (sprite: Graphics): GroundLayerRuntime => {
    const existing = runtimeBySprite.get(sprite);
    if (existing) {
        return existing;
    }
    const created: GroundLayerRuntime = {
        lastOriginX: null,
        lastOriginY: null,
        lastTextureUid: -1
    };
    runtimeBySprite.set(sprite, created);
    return created;
};

const resolveTextureUid = (texture: Texture | null): number => {
    return texture?.source?.uid ?? -1;
};

export const renderGroundLayer = (
    cameraX: number,
    cameraY: number,
    layer: Container,
    sprite: Graphics,
    texture: Texture | null = null
): void => {
    const runtime = ensureGroundRuntime(sprite);
    const origin = resolveGroundOrigin(cameraX, cameraY);
    const textureUid = resolveTextureUid(texture);
    const unchanged = runtime.lastOriginX === origin.x
        && runtime.lastOriginY === origin.y
        && runtime.lastTextureUid === textureUid;
    if (unchanged) {
        if (!layer.children.includes(sprite)) {
            layer.addChild(sprite);
        }
        return;
    }
    runtime.lastOriginX = origin.x;
    runtime.lastOriginY = origin.y;
    runtime.lastTextureUid = textureUid;

    sprite.clear();

    for (let tx = GROUND_DRAW_MIN; tx <= GROUND_DRAW_MAX; tx += 1) {
        for (let ty = GROUND_DRAW_MIN; ty <= GROUND_DRAW_MAX; ty += 1) {
            const x = origin.x + (tx * GROUND_TILE_SIZE);
            const y = origin.y + (ty * GROUND_TILE_SIZE);
            if (texture) {
                sprite
                    .rect(x, y, GROUND_TEXTURE_SIZE, GROUND_TEXTURE_SIZE)
                    .fill({ texture });
            } else {
                const alternate = (tx + ty) % 3 === 0;
                sprite
                    .rect(x, y, GROUND_TEXTURE_SIZE, GROUND_TEXTURE_SIZE)
                    .fill(alternate ? 0x1a2e27 : 0x20362d);
            }
        }
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
