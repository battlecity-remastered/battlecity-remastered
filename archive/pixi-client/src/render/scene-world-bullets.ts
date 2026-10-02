import { Graphics, Sprite } from "pixi.js";
import type { ClientState } from "../app/state.js";
import type { SceneLayers } from "./scene-layers.js";
import { resolveBulletFrameRect } from "./items/item-parity-helpers.js";
import { getFrameTexture } from "./TextureRegistry.js";
import { isWorldPointVisible, type WorldViewBounds } from "./world-bounds.js";
import { syncEntityCache } from "./scene-world-objects-shared.js";

const resolveBulletSprite = (textures: SceneLayers["textures"]): Sprite | null => {
    const texture = getFrameTexture(textures.bullets, "bullet:default", 0, 0, 8, 8);
    if (!texture) {
        return null;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0, 0);
    return sprite;
};

const createFallbackBulletEntity = (): Graphics => {
    const bullet = new Graphics();
    bullet.circle(0, 0, 3).fill(0xf2cb56);
    return bullet;
};

const createBulletEntity = (layers: SceneLayers): Sprite | Graphics => {
    const sprite = resolveBulletSprite(layers.textures);
    return sprite ?? createFallbackBulletEntity();
};

const resolveVisibleBulletIds = (state: ClientState, viewBounds: WorldViewBounds): string[] => {
    const ids: string[] = [];
    for (const bullet of state.bullets.values()) {
        if (isWorldPointVisible(viewBounds, bullet.x, bullet.y, 24)) {
            ids.push(bullet.id);
        }
    }
    return ids;
};

export const syncWorldBulletSprites = (
    state: ClientState,
    layers: SceneLayers,
    viewBounds: WorldViewBounds,
    nowMs: number
): void => {
    const visibleBulletIds = resolveVisibleBulletIds(state, viewBounds);
    syncEntityCache(layers.bulletSprites, layers.objectLayer, visibleBulletIds, () => createBulletEntity(layers));
    const animation = Math.floor(nowMs / 80) % 4;
    for (const bulletId of visibleBulletIds) {
        const bullet = state.bullets.get(bulletId);
        const sprite = layers.bulletSprites.get(bulletId);
        if (!bullet || !sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const rect = resolveBulletFrameRect(animation, Math.max(0, bullet.type));
            const frame = getFrameTexture(
                layers.textures.bullets,
                `bullet:${animation}:${bullet.type}`,
                rect.x,
                rect.y,
                rect.width,
                rect.height
            );
            if (frame && sprite.texture !== frame) {
                sprite.texture = frame;
            }
        }
        sprite.position.set(bullet.x, bullet.y);
    }
};
