import { Graphics, Sprite, Text, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../TextureRegistry.js";
import { resolveTankMuzzlePosition } from "../../gameplay/combat/shot-geometry.js";
import { renderExplosions } from "./explosion-renderer.js";
import { renderFloatingPoints } from "./floating-points-renderer.js";

const MUZZLE_FLASH_MS = 120;
const SHAKE_MS = 150;

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
        sprite.rect(muzzle.x - 6, muzzle.y - 6, 12, 12).fill({ texture: frame, alpha: 0.9 });
        return;
    }
    sprite.circle(muzzle.x, muzzle.y, 7).fill({ color: 0xffd166, alpha: 0.85 });
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
