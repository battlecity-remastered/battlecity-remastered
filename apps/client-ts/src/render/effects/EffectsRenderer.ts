import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import { resolveTankMuzzlePosition } from "../../gameplay/combat/shot-geometry.js";

const MUZZLE_FLASH_MS = 120;
const SHAKE_MS = 150;
const EXPLOSION_FRAME_MS = 80;
const FLOAT_POINTS_MS = 900;
const EXPLOSION_SMALL_MS = EXPLOSION_FRAME_MS * 10;
const EXPLOSION_LARGE_MS = EXPLOSION_FRAME_MS * 16;

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

const resolveExplosionDuration = (variant: "small" | "large"): number => {
    return variant === "large" ? EXPLOSION_LARGE_MS : EXPLOSION_SMALL_MS;
};

const resolveExplosionFrameCount = (variant: "small" | "large"): number => {
    return variant === "large" ? 16 : 10;
};

const renderExplosionFallback = (
    sprite: Graphics,
    variant: "small" | "large",
    x: number,
    y: number
): void => {
    const size = variant === "large" ? 120 : 48;
    sprite
        .rect(x - (size / 2), y - (size / 2), size, size)
        .stroke({ color: 0xff6b6b, width: 2, alpha: 0.7 });
};

const renderExplosionFrame = (
    sprite: Graphics,
    variant: "small" | "large",
    x: number,
    y: number,
    frame: Texture
): void => {
    const size = variant === "large" ? 96 : 48;
    sprite
        .rect(x - (size / 2), y - (size / 2), size, size)
        .fill({ texture: frame, alpha: 0.9 });
};

const renderExplosions = (
    state: ClientState,
    nowMs: number,
    sprite: Graphics,
    smallExplosionTexture: Texture | null,
    largeExplosionTexture: Texture | null
): void => {
    for (let i = state.events.effects.explosions.length - 1; i >= 0; i -= 1) {
        const explosion = state.events.effects.explosions[i];
        if (!explosion) {
            continue;
        }
        const age = nowMs - explosion.createdAt;
        const ttl = resolveExplosionDuration(explosion.variant);
        if (age >= ttl) {
            state.events.effects.explosions.splice(i, 1);
            continue;
        }
        const frameCount = resolveExplosionFrameCount(explosion.variant);
        const frameIndex = Math.min(frameCount - 1, Math.floor(age / EXPLOSION_FRAME_MS));
        const texture = explosion.variant === "large" ? largeExplosionTexture : smallExplosionTexture;
        const frame = texture
            ? getFrameTexture(texture, `explosion:${explosion.variant}:${frameIndex}`, frameIndex * 48, 0, 48, 48)
            : null;
        if (!frame) {
            renderExplosionFallback(sprite, explosion.variant, explosion.x, explosion.y);
            continue;
        }
        renderExplosionFrame(sprite, explosion.variant, explosion.x, explosion.y, frame);
    }
};

const renderFloatingPoints = (
    state: ClientState,
    nowMs: number,
    sprite: Graphics
): void => {
    for (let i = state.events.effects.floatingPoints.length - 1; i >= 0; i -= 1) {
        const points = state.events.effects.floatingPoints[i];
        if (!points) {
            continue;
        }
        const age = nowMs - points.createdAt;
        if (age >= FLOAT_POINTS_MS) {
            state.events.effects.floatingPoints.splice(i, 1);
            continue;
        }
        const t = age / FLOAT_POINTS_MS;
        const yOffset = Math.floor(28 * t);
        const alpha = Math.max(0, 1 - t);
        sprite
            .rect(points.x - 10, points.y - 20 - yOffset, 20, 10)
            .fill({ color: 0xffd166, alpha: 0.75 * alpha })
            .stroke({ color: 0x2a1a00, width: 1, alpha: 0.8 * alpha });
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
    muzzleFlashTexture: Texture | null = null,
    smallExplosionTexture: Texture | null = null,
    largeExplosionTexture: Texture | null = null
): void => {
    sprite.clear();
    const baseStageX = stage.position.x;
    const baseStageY = stage.position.y;
    renderMuzzleFlash(state, nowMs, sprite, muzzleFlashTexture);
    renderExplosions(state, nowMs, sprite, smallExplosionTexture, largeExplosionTexture);
    renderFloatingPoints(state, nowMs, sprite);
    ensureEffectLayerSprite(layer, sprite);
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
