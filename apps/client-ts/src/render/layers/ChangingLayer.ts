import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import { isRefreshDue } from "../pacing.js";
import {
    isFactoryType,
    resolveFactoryDigits,
    resolvePopulationFrame,
    resolvePopulationOffset,
    resolveSmokeFrame,
    resolveSmokePlacement
} from "./changing-layer-helpers.js";
import { isDefenseVisibleToLocalPlayer } from "../parity/defense-visibility.js";

const TILE_SIZE = 48;
const CHANGING_LAYER_REFRESH_MS = 33;

type OverlaySpriteDef = {
    key: string;
    texture: Texture;
    x: number;
    y: number;
    width: number;
    height: number;
    alpha: number;
};

type OverlayRuntime = {
    container: Container;
    sprites: Map<string, Sprite>;
    lastRefreshAt: number | null;
};

const overlayRuntimeBySprite = new WeakMap<Graphics, OverlayRuntime>();

const ensureOverlayRuntime = (layer: Container, sprite: Graphics): OverlayRuntime => {
    const existing = overlayRuntimeBySprite.get(sprite);
    if (existing) {
        if (existing.container.destroyed) {
            overlayRuntimeBySprite.delete(sprite);
        } else {
        if (existing.container.parent !== layer) {
            const spriteIndex = layer.children.includes(sprite) ? layer.getChildIndex(sprite) : layer.children.length - 1;
            const insertIndex = Math.max(0, Math.min(layer.children.length, spriteIndex + 1));
            layer.addChildAt(existing.container, insertIndex);
        } else if (layer.children.includes(sprite)) {
            const spriteIndex = layer.getChildIndex(sprite);
            const targetIndex = Math.max(0, Math.min(layer.children.length - 1, spriteIndex + 1));
            if (layer.getChildIndex(existing.container) !== targetIndex) {
                layer.setChildIndex(existing.container, targetIndex);
            }
        }
        return existing;
        }
    }

    const container = new Container();
    const spriteIndex = layer.children.includes(sprite) ? layer.getChildIndex(sprite) : layer.children.length - 1;
    const insertIndex = Math.max(0, Math.min(layer.children.length, spriteIndex + 1));
    layer.addChildAt(container, insertIndex);
    const created: OverlayRuntime = {
        container,
        sprites: new Map<string, Sprite>(),
        lastRefreshAt: null
    };
    overlayRuntimeBySprite.set(sprite, created);
    return created;
};

export const renderChangingLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    populationTexture: Texture | null = null,
    smokeTexture: Texture | null = null,
    blackNumbersTexture: Texture | null = null,
    itemTexture: Texture | null = null,
    nowMs: number = Date.now()
): void => {
    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
    const overlayRuntime = ensureOverlayRuntime(layer, sprite);
    if (!isRefreshDue(overlayRuntime.lastRefreshAt, nowMs, CHANGING_LAYER_REFRESH_MS)) {
        return;
    }
    overlayRuntime.lastRefreshAt = nowMs;
    const overlayDefs: OverlaySpriteDef[] = [];
    sprite.clear();

    for (const building of state.buildings.values()) {
        if (building.population > 0) {
            const frame = resolvePopulationFrame(building.type, building.population);
            const offset = resolvePopulationOffset(building.type);
            if (populationTexture) {
                const populationFrame = getFrameTexture(
                    populationTexture,
                    `population:${frame.row}:${frame.column}`,
                    frame.column * TILE_SIZE,
                    frame.row * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE
                );
                if (populationFrame) {
                    overlayDefs.push({
                        key: `population:${building.id}`,
                        texture: populationFrame,
                        x: (building.tileX * TILE_SIZE) + offset.x,
                        y: (building.tileY * TILE_SIZE) + offset.y,
                        width: TILE_SIZE,
                        height: TILE_SIZE,
                        alpha: 0.88
                    });
                } else {
                    const ratio = Math.max(0, Math.min(1, frame.column / 6));
                    const width = Math.floor(TILE_SIZE * ratio);
                    sprite.rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4).fill(0x66f2a0);
                }
            } else {
                const ratio = Math.max(0, Math.min(1, frame.column / 6));
                const width = Math.floor(TILE_SIZE * ratio);
                sprite.rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4).fill(0x66f2a0);
            }
        }

        if (isFactoryType(building.type) && smokeTexture) {
            const smokeFrame = resolveSmokeFrame(nowMs);
            const smoke = getFrameTexture(smokeTexture, `smoke:${smokeFrame}`, 0, smokeFrame * 60, 180, 60);
            if (smoke) {
                const placement = resolveSmokePlacement(building.tileX, building.tileY);
                overlayDefs.push({
                    key: `factory-smoke:${building.id}`,
                    texture: smoke,
                    x: placement.x,
                    y: placement.y,
                    width: placement.width,
                    height: placement.height,
                    alpha: 0.6
                });
            }

            if (blackNumbersTexture) {
                const stock = state.factoryStock.get(building.cityId);
                const itemType = building.type % 100;
                const itemCount = stock?.get(itemType) ?? 0;
                const digits = resolveFactoryDigits(itemCount);
                const tensFrame = getFrameTexture(blackNumbersTexture, `factory:tens:${digits.tens}`, digits.tens * 16, 0, 16, 16);
                const onesFrame = getFrameTexture(blackNumbersTexture, `factory:ones:${digits.ones}`, digits.ones * 16, 0, 16, 16);
                if (tensFrame) {
                    overlayDefs.push({
                        key: `factory-digits:tens:${building.id}`,
                        texture: tensFrame,
                        x: (building.tileX * TILE_SIZE) + digits.tensOffset.x,
                        y: (building.tileY * TILE_SIZE) + digits.tensOffset.y,
                        width: 16,
                        height: 16,
                        alpha: 0.95
                    });
                }
                if (onesFrame) {
                    overlayDefs.push({
                        key: `factory-digits:ones:${building.id}`,
                        texture: onesFrame,
                        x: (building.tileX * TILE_SIZE) + digits.onesOffset.x,
                        y: (building.tileY * TILE_SIZE) + digits.onesOffset.y,
                        width: 16,
                        height: 16,
                        alpha: 0.95
                    });
                }

                if (itemTexture && itemCount > 0) {
                    const itemFrame = getFrameTexture(
                        itemTexture,
                        `factory-item:${itemType}`,
                        itemType * 32,
                        0,
                        32,
                        32
                    );
                    if (itemFrame) {
                        overlayDefs.push({
                            key: `factory-item:${building.id}`,
                            texture: itemFrame,
                            x: (building.tileX * TILE_SIZE) + 56,
                            y: (building.tileY * TILE_SIZE) + 102,
                            width: 32,
                            height: 32,
                            alpha: 0.95
                        });
                    }
                }
            }
        }
    }

    for (const defense of state.defenses.values()) {
        if (!isDefenseVisibleToLocalPlayer(state, defense)) {
            continue;
        }
        const ratio = Math.max(0, Math.min(1, defense.health / Math.max(1, defense.maxHealth)));
        const width = Math.floor(TILE_SIZE * ratio);
        sprite
            .rect(defense.tileX * TILE_SIZE, (defense.tileY * TILE_SIZE) - 2, width, 2)
            .fill(0xffd68a);
    }

    const nextKeys = new Set(overlayDefs.map((entry) => entry.key));
    for (const [key, overlaySprite] of overlayRuntime.sprites.entries()) {
        if (nextKeys.has(key)) {
            continue;
        }
        if (overlaySprite.parent === overlayRuntime.container) {
            overlayRuntime.container.removeChild(overlaySprite);
        }
        overlaySprite.destroy();
        overlayRuntime.sprites.delete(key);
    }

    let orderIndex = 0;
    for (const overlay of overlayDefs) {
        let overlaySprite = overlayRuntime.sprites.get(overlay.key);
        if (!overlaySprite) {
            overlaySprite = new Sprite();
            overlayRuntime.sprites.set(overlay.key, overlaySprite);
            overlayRuntime.container.addChild(overlaySprite);
        } else if (overlaySprite.parent !== overlayRuntime.container) {
            overlayRuntime.container.addChild(overlaySprite);
        }
        overlaySprite.texture = overlay.texture;
        overlaySprite.position.set(overlay.x, overlay.y);
        overlaySprite.width = overlay.width;
        overlaySprite.height = overlay.height;
        overlaySprite.alpha = overlay.alpha;
        overlaySprite.visible = true;
        if (
            overlaySprite.parent === overlayRuntime.container
            && orderIndex >= 0
            && orderIndex < overlayRuntime.container.children.length
        ) {
            const currentIndex = overlayRuntime.container.getChildIndex(overlaySprite);
            if (currentIndex !== orderIndex) {
                overlayRuntime.container.setChildIndex(overlaySprite, orderIndex);
            }
        }
        orderIndex += 1;
    }
    overlayRuntime.container.visible = overlayDefs.length > 0;

};
