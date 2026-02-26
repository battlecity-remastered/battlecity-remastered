import { Graphics, Sprite, Text, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import { resolveTankMuzzlePosition } from "../../gameplay/combat/shot-geometry.js";

const MUZZLE_FLASH_MS = 120;
const SHAKE_MS = 150;
const FLOAT_POINTS_MS = 900;

type ExplosionVariant = "small" | "large";
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

const renderMuzzleFlash = (
    state: ClientState,
    nowMs: number,
    sprite: Graphics,
    muzzleFlashTexture: Texture | null
): void => {
    const shotAge = nowMs - state.local.lastShotAt;
    if (shotAge < 0 || shotAge >= MUZZLE_FLASH_MS) {
        return;
    }
    const muzzle = resolveTankMuzzlePosition(state.local.x, state.local.y, state.local.direction);
    const frame = muzzleFlashTexture
        ? getFrameTexture(muzzleFlashTexture, "muzzle:0", 0, 0, 12, 12)
        : null;
    if (frame) {
        sprite
            .rect(muzzle.x - 6, muzzle.y - 6, 12, 12)
            .fill({ texture: frame, alpha: 0.9 });
        return;
    }
    sprite
        .circle(muzzle.x, muzzle.y, 7)
        .fill({ color: 0xffd166, alpha: 0.85 });
};

const resolveExplosionConfig = (variant: ExplosionVariant): ExplosionVariantConfig => {
    return EXPLOSION_CONFIG[variant];
};

const resolveExplosionDuration = (variant: ExplosionVariant): number => {
    const config = resolveExplosionConfig(variant);
    return config.frameCount * config.frameDurationMs;
};

const renderExplosionFallback = (
    sprite: Graphics,
    variant: ExplosionVariant,
    x: number,
    y: number
): void => {
    const size = resolveExplosionConfig(variant).frameSize;
    sprite
        .rect(x - (size / 2), y - (size / 2), size, size)
        .stroke({ color: 0xff6b6b, width: 2, alpha: 0.7 });
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
    return getFrameTexture(
        texture,
        `explosion:${variant}:${frameIndex}:${frameSize}`,
        frameX,
        frameY,
        frameSize,
        frameSize
    );
};

const removeExplosionSprite = (
    layer: Container,
    explosionSprites: Map<string, Sprite>,
    explosionId: string
): void => {
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

const createFloatingPointsLabel = (): Text => {
    return new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 15,
            fontWeight: "700",
            fill: 0xffd166,
            stroke: {
                color: 0x2a1a00,
                width: 3,
                join: "round"
            }
        }
    });
};

const removeFloatingPointsLabel = (
    layer: Container,
    floatingPointLabels: Map<string, Text>,
    pointsId: string
): void => {
    const label = floatingPointLabels.get(pointsId);
    if (!label) {
        return;
    }
    if (label.parent === layer) {
        layer.removeChild(label);
    }
    label.destroy();
    floatingPointLabels.delete(pointsId);
};

const formatFloatingPointsAmount = (amount: number): string => {
    if (!Number.isFinite(amount)) {
        return "0";
    }
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/\.?0+$/, "");
};

const renderExplosions = (
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

        syncExplosionSprite(
            layer,
            overlaySprite,
            explosionSprites,
            explosion,
            frame
        );
    }
    pruneStaleExplosionSprites(layer, explosionSprites, activeExplosionIds);
};

const renderFloatingPoints = (
    state: ClientState,
    nowMs: number,
    layer: Container,
    floatingPointLabels: Map<string, Text>
): void => {
    const activePointIds = new Set<string>();
    for (let i = state.events.effects.floatingPoints.length - 1; i >= 0; i -= 1) {
        const points = state.events.effects.floatingPoints[i];
        if (!points) {
            continue;
        }
        const age = nowMs - points.createdAt;
        if (age >= FLOAT_POINTS_MS) {
            state.events.effects.floatingPoints.splice(i, 1);
            removeFloatingPointsLabel(layer, floatingPointLabels, points.id);
            continue;
        }
        activePointIds.add(points.id);
        const t = age / FLOAT_POINTS_MS;
        const yOffset = Math.floor(28 * t);
        const alpha = Math.max(0, 1 - t);
        let label = floatingPointLabels.get(points.id);
        if (!label) {
            label = createFloatingPointsLabel();
            floatingPointLabels.set(points.id, label);
        }
        const text = formatFloatingPointsAmount(points.amount);
        if (label.text !== text) {
            label.text = text;
        }
        label.anchor.set(0.5, 1);
        label.position.set(points.x, points.y - 10 - yOffset);
        label.alpha = alpha;
        if (label.parent !== layer) {
            layer.addChild(label);
        }
    }
    for (const pointsId of floatingPointLabels.keys()) {
        if (activePointIds.has(pointsId)) {
            continue;
        }
        removeFloatingPointsLabel(layer, floatingPointLabels, pointsId);
    }
};

const ensureEffectLayerSprite = (layer: Container, sprite: Graphics): void => {
    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};

const applyOrbShake = (stage: Container, baseStageX: number, baseStageY: number): void => {
    stage.position.set(
        baseStageX + Math.round((Math.random() - 0.5) * 4),
        baseStageY + Math.round((Math.random() - 0.5) * 4)
    );
};

export const renderEffects = (
    state: ClientState,
    nowMs: number,
    stage: Container,
    layer: Container,
    sprite: Graphics,
    explosionSprites: Map<string, Sprite>,
    floatingPointLabels: Map<string, Text>,
    muzzleFlashTexture: Texture | null = null,
    smallExplosionTexture: Texture | null = null,
    largeExplosionTexture: Texture | null = null
): void => {
    ensureEffectLayerSprite(layer, sprite);
    sprite.clear();
    const baseStageX = stage.position.x;
    const baseStageY = stage.position.y;
    renderMuzzleFlash(state, nowMs, sprite, muzzleFlashTexture);
    renderExplosions(
        state,
        nowMs,
        layer,
        sprite,
        sprite,
        explosionSprites,
        smallExplosionTexture,
        largeExplosionTexture
    );
    renderFloatingPoints(state, nowMs, layer, floatingPointLabels);
    const lastOrbEvent = state.events.lastOrbEvent;
    const orbAge = lastOrbEvent ? nowMs - lastOrbEvent.at : Number.POSITIVE_INFINITY;
    const shouldShakeForOrb = !!lastOrbEvent
        && lastOrbEvent.targetCityId !== state.local.city
        && orbAge >= 0
        && orbAge < SHAKE_MS;
    if (shouldShakeForOrb) {
        applyOrbShake(stage, baseStageX, baseStageY);
        return;
    }
    stage.position.set(baseStageX, baseStageY);
};
