import { Graphics, Sprite, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../TextureRegistry.js";

export type ExplosionVariant = "small" | "large";

type ExplosionVariantConfig = {
    frameSize: number;
    frameCount: number;
    frameDurationMs: number;
};

const EXPLOSION_CONFIG: Readonly<Record<ExplosionVariant, ExplosionVariantConfig>> = {
    small: {
        frameSize: 48,
        frameCount: 10,
        frameDurationMs: 100
    },
    large: {
        frameSize: 144,
        frameCount: 8,
        frameDurationMs: 90
    }
};

const resolveExplosionConfig = (variant: ExplosionVariant): ExplosionVariantConfig => EXPLOSION_CONFIG[variant];

const resolveExplosionDuration = (variant: ExplosionVariant): number => {
    const config = resolveExplosionConfig(variant);
    return config.frameCount * config.frameDurationMs;
};

const renderExplosionFallback = (sprite: Graphics, variant: ExplosionVariant, x: number, y: number): void => {
    const size = resolveExplosionConfig(variant).frameSize;
    sprite.rect(x - (size / 2), y - (size / 2), size, size).stroke({ color: 0xff6b6b, width: 2, alpha: 0.7 });
};

const resolveExplosionFrameTexture = (
    texture: Texture | null,
    variant: ExplosionVariant,
    frameIndex: number
): Texture | null => {
    if (!texture) {
        return null;
    }
    const config = resolveExplosionConfig(variant);
    const frameSize = config.frameSize;
    const frameCount = config.frameCount;
    const sourceWidth = Number.isFinite(texture.source.width) ? texture.source.width : texture.width;
    const sourceHeight = Number.isFinite(texture.source.height) ? texture.source.height : texture.height;
    const framesPerRow = Math.max(1, Math.floor(sourceWidth / frameSize));
    const rows = Math.max(1, Math.floor(sourceHeight / frameSize));
    const availableFrames = Math.min(frameCount, framesPerRow * rows);
    if (frameIndex < 0 || frameIndex >= availableFrames) {
        return null;
    }
    const frameX = (frameIndex % framesPerRow) * frameSize;
    const frameY = Math.floor(frameIndex / framesPerRow) * frameSize;
    return getFrameTexture(texture, `explosion:${variant}:${frameIndex}:${frameSize}`, frameX, frameY, frameSize, frameSize);
};

const removeExplosionSprite = (layer: Container, explosionSprites: Map<string, Sprite>, explosionId: string): void => {
    const sprite = explosionSprites.get(explosionId);
    if (!sprite) {
        return;
    }
    if (sprite.parent === layer) {
        layer.removeChild(sprite);
    }
    sprite.destroy();
    explosionSprites.delete(explosionId);
};

const syncExplosionSprite = (
    layer: Container,
    overlaySprite: Graphics,
    explosionSprites: Map<string, Sprite>,
    explosion: { id: string; x: number; y: number; variant: ExplosionVariant; },
    frame: Texture
): void => {
    let explosionSprite = explosionSprites.get(explosion.id);
    if (!explosionSprite) {
        explosionSprite = new Sprite(frame);
        explosionSprites.set(explosion.id, explosionSprite);
    } else {
        explosionSprite.texture = frame;
    }

    const size = resolveExplosionConfig(explosion.variant).frameSize;
    explosionSprite.position.set(explosion.x - (size / 2), explosion.y - (size / 2));
    explosionSprite.alpha = 0.9;
    explosionSprite.visible = true;
    explosionSprite.width = size;
    explosionSprite.height = size;

    if (explosionSprite.parent !== layer) {
        const overlayIndex = layer.children.includes(overlaySprite)
            ? layer.getChildIndex(overlaySprite)
            : layer.children.length;
        layer.addChildAt(explosionSprite, Math.max(0, overlayIndex));
        return;
    }

    if (!layer.children.includes(overlaySprite)) {
        return;
    }
    const overlayIndex = layer.getChildIndex(overlaySprite);
    if (overlayIndex <= 0) {
        return;
    }
    const currentIndex = layer.getChildIndex(explosionSprite);
    if (currentIndex >= overlayIndex) {
        layer.setChildIndex(explosionSprite, overlayIndex - 1);
    }
};

const pruneStaleExplosionSprites = (
    layer: Container,
    explosionSprites: Map<string, Sprite>,
    activeExplosionIds: Set<string>
): void => {
    for (const explosionId of explosionSprites.keys()) {
        if (activeExplosionIds.has(explosionId)) {
            continue;
        }
        removeExplosionSprite(layer, explosionSprites, explosionId);
    }
};

export const renderExplosions = (
    state: ClientState,
    nowMs: number,
    layer: Container,
    overlaySprite: Graphics,
    fallbackSprite: Graphics,
    explosionSprites: Map<string, Sprite>,
    smallExplosionTexture: Texture | null,
    largeExplosionTexture: Texture | null
): void => {
    const activeExplosionIds = new Set<string>();
    for (let i = state.events.effects.explosions.length - 1; i >= 0; i -= 1) {
        const explosion = state.events.effects.explosions[i];
        if (!explosion) {
            continue;
        }

        const age = nowMs - explosion.createdAt;
        const ttl = resolveExplosionDuration(explosion.variant);
        if (age >= ttl) {
            removeExplosionSprite(layer, explosionSprites, explosion.id);
            state.events.effects.explosions.splice(i, 1);
            continue;
        }

        activeExplosionIds.add(explosion.id);
        const config = resolveExplosionConfig(explosion.variant);
        const frameIndex = Math.floor(age / config.frameDurationMs);
        const texture = explosion.variant === "large" ? largeExplosionTexture : smallExplosionTexture;
        const frame = resolveExplosionFrameTexture(texture, explosion.variant, frameIndex);
        if (!frame) {
            removeExplosionSprite(layer, explosionSprites, explosion.id);
            renderExplosionFallback(fallbackSprite, explosion.variant, explosion.x, explosion.y);
            continue;
        }

        syncExplosionSprite(layer, overlaySprite, explosionSprites, explosion, frame);
    }
    pruneStaleExplosionSprites(layer, explosionSprites, activeExplosionIds);
};
