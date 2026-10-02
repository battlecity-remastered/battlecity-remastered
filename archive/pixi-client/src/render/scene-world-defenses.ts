import { Graphics, Sprite, type Texture } from "pixi.js";
import type { ClientState } from "../app/state.js";
import type { SceneLayers } from "./scene-layers.js";
import { resolveDefenseDamageColumn } from "./parity/defense-damage.js";
import { getFrameTexture } from "./TextureRegistry.js";
import { resolveVisibleDefenseIds as resolveSleeperVisibleDefenseIds } from "./parity/defense-visibility.js";
import { isWorldRectVisible, type WorldViewBounds } from "./world-bounds.js";
import { TILE } from "./parity/constants.js";
import { syncEntityCache } from "./scene-world-objects-shared.js";

const resolveDefenseTexture = (
    textures: SceneLayers["textures"],
    defenseType: number,
    health: number,
    maxHealth: number
): Texture | null => {
    const typeRow = Math.max(0, Math.min(2, defenseType - 9));
    const damageColumn = resolveDefenseDamageColumn(defenseType, health, maxHealth);
    return getFrameTexture(textures.turretBase, `defense:${typeRow}:${damageColumn}`, damageColumn * 48, typeRow * 48, 48, 48);
};

const resolveDefenseHeadTexture = (
    textures: SceneLayers["textures"],
    defenseType: number,
    orientation: number
): Texture | null => {
    const row = Math.max(0, Math.min(2, defenseType - 9));
    const heading = ((Math.floor(orientation) % 32) + 32) % 32;
    const frame = Math.max(0, Math.min(15, Math.floor(heading / 2)));
    return getFrameTexture(textures.turretHead, `defense-head:${row}:${frame}`, frame * 48, row * 48, 48, 48);
};

const resolveVisibleDefenseIds = (state: ClientState, viewBounds: WorldViewBounds): string[] => {
    const ids: string[] = [];
    for (const defenseId of resolveSleeperVisibleDefenseIds(state)) {
        const defense = state.defenses.get(defenseId);
        if (!defense) {
            continue;
        }
        if (isWorldRectVisible(viewBounds, defense.tileX * TILE, defense.tileY * TILE, TILE, TILE)) {
            ids.push(defenseId);
        }
    }
    return ids;
};

const createFallbackDefenseEntity = (): Graphics => {
    const entity = new Graphics();
    entity.roundRect(4, 4, TILE - 8, TILE - 8, 2).fill(0x7d8ea8);
    return entity;
};

const createDefenseEntity = (layers: SceneLayers, state: ClientState): Sprite | Graphics => {
    const firstDefense = state.defenses.values().next().value;
    if (!firstDefense) {
        return createFallbackDefenseEntity();
    }
    const texture = resolveDefenseTexture(layers.textures, firstDefense.type, firstDefense.health, firstDefense.maxHealth);
    return texture ? new Sprite(texture) : createFallbackDefenseEntity();
};

const syncDefenseSprites = (state: ClientState, layers: SceneLayers, visibleDefenseIds: string[]): void => {
    syncEntityCache(layers.defenseSprites, layers.objectLayer, visibleDefenseIds, () => createDefenseEntity(layers, state));
    for (const defenseId of visibleDefenseIds) {
        const defense = state.defenses.get(defenseId);
        const sprite = layers.defenseSprites.get(defenseId);
        if (!defense || !sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const frame = resolveDefenseTexture(layers.textures, defense.type, defense.health, defense.maxHealth);
            if (frame && sprite.texture !== frame) {
                sprite.texture = frame;
            }
        }
        sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
    }
};

const resolveDefenseOrientation = (orientation: number | undefined, nowMs: number): number => {
    const fallback = Math.floor((nowMs / 100) % 32);
    if (typeof orientation === "number" && Number.isFinite(orientation)) {
        return orientation;
    }
    return fallback;
};

const syncDefenseHeadSprites = (state: ClientState, layers: SceneLayers, nowMs: number, visibleDefenseIds: string[]): void => {
    syncEntityCache(layers.defenseHeadSprites, layers.objectLayer, visibleDefenseIds, () => new Sprite());
    for (const defenseId of visibleDefenseIds) {
        const defense = state.defenses.get(defenseId);
        const sprite = layers.defenseHeadSprites.get(defenseId);
        if (!defense || !(sprite instanceof Sprite)) {
            continue;
        }
        const frame = resolveDefenseHeadTexture(
            layers.textures,
            defense.type,
            resolveDefenseOrientation(defense.orientation, nowMs)
        );
        if (frame && sprite.texture !== frame) {
            sprite.texture = frame;
        }
        sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
    }
};

export const syncWorldDefenseSprites = (
    state: ClientState,
    layers: SceneLayers,
    viewBounds: WorldViewBounds,
    nowMs: number
): void => {
    const visibleDefenseIds = resolveVisibleDefenseIds(state, viewBounds);
    syncDefenseSprites(state, layers, visibleDefenseIds);
    syncDefenseHeadSprites(state, layers, nowMs, visibleDefenseIds);
};
