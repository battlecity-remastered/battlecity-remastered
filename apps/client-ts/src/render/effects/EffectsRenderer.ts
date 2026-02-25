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
    const shotAge = nowMs - state.local.lastShotAt;
    const baseStageX = stage.position.x;
    const baseStageY = stage.position.y;

    if (shotAge >= 0 && shotAge < MUZZLE_FLASH_MS) {
        const muzzle = resolveTankMuzzlePosition(state.local.x, state.local.y, state.local.direction);
        const frame = muzzleFlashTexture
            ? getFrameTexture(muzzleFlashTexture, "muzzle:0", 0, 0, 12, 12)
            : null;
        if (frame) {
            sprite
                .rect(muzzle.x - 6, muzzle.y - 6, 12, 12)
                .fill({ texture: frame, alpha: 0.9 });
        } else {
            sprite
                .circle(muzzle.x, muzzle.y, 7)
                .fill({ color: 0xffd166, alpha: 0.85 });
        }
    }

    for (let i = state.events.effects.explosions.length - 1; i >= 0; i -= 1) {
        const explosion = state.events.effects.explosions[i];
        if (!explosion) {
            continue;
        }
        const age = nowMs - explosion.createdAt;
        const ttl = explosion.variant === "large" ? EXPLOSION_LARGE_MS : EXPLOSION_SMALL_MS;
        if (age >= ttl) {
            state.events.effects.explosions.splice(i, 1);
            continue;
        }
        const frameCount = explosion.variant === "large" ? 16 : 10;
        const frameIndex = Math.min(frameCount - 1, Math.floor(age / EXPLOSION_FRAME_MS));
        const texture = explosion.variant === "large" ? largeExplosionTexture : smallExplosionTexture;
        const frame = texture
            ? getFrameTexture(texture, `explosion:${explosion.variant}:${frameIndex}`, frameIndex * 48, 0, 48, 48)
            : null;
        if (frame) {
            const size = explosion.variant === "large" ? 96 : 48;
            sprite
                .rect(explosion.x - (size / 2), explosion.y - (size / 2), size, size)
                .fill({ texture: frame, alpha: 0.9 });
        } else {
            const size = explosion.variant === "large" ? 120 : 48;
            sprite
                .rect(explosion.x - (size / 2), explosion.y - (size / 2), size, size)
                .stroke({ color: 0xff6b6b, width: 2, alpha: 0.7 });
        }
    }

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

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }

    const lastOrbEvent = state.events.lastOrbEvent;
    const orbAge = lastOrbEvent ? nowMs - lastOrbEvent.at : Number.POSITIVE_INFINITY;
    const shouldShakeForOrb =
        !!lastOrbEvent &&
        lastOrbEvent.targetCityId !== state.local.city &&
        orbAge >= 0 &&
        orbAge < SHAKE_MS;

    if (shouldShakeForOrb) {
        stage.position.set(
            baseStageX + Math.round((Math.random() - 0.5) * 4),
            baseStageY + Math.round((Math.random() - 0.5) * 4)
        );
        return;
    }
    stage.position.set(baseStageX, baseStageY);
};
