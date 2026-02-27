import { Graphics, Sprite, type Texture } from "pixi.js";
import type { ClientState } from "../app/state.js";
import type { SceneLayers } from "./scene-layers.js";
import {
    resolveBuildingAnimationFrameX,
    resolveBuildingBaseFrame,
    resolveBuildingOverlay
} from "./layers/building-parity-helpers.js";
import { getFrameTexture } from "./TextureRegistry.js";
import { resolveResearchStripPlacement } from "./layers/changing-layer-helpers.js";
import { isWorldRectVisible, type WorldViewBounds } from "./world-bounds.js";
import { TILE } from "./parity/constants.js";
import { resolveBuildingTexture, replaceEntityInLayer, syncEntityCache } from "./scene-world-objects-shared.js";

const RESEARCH_BUILDING_FAMILY = 4;

const isResearchBuildingType = (buildingType: number): boolean => {
    if (!Number.isFinite(buildingType) || buildingType < 100) {
        return false;
    }
    return Math.floor(buildingType / 100) === RESEARCH_BUILDING_FAMILY;
};

const resolveResearchStripTexture = (
    state: ClientState,
    textures: SceneLayers["textures"],
    buildingType: number,
    cityId: number
): Texture | null => {
    const cityResearch = state.research.get(cityId);
    const isComplete = cityResearch?.completed.includes(buildingType) ?? false;
    const source = isComplete ? textures.researchComplete : textures.research;
    if (!source) {
        return null;
    }
    return getFrameTexture(source, `research-strip:${isComplete ? "complete" : "pending"}`, 0, 5, 10, 134);
};

const resolveVisibleBuildingIds = (state: ClientState, viewBounds: WorldViewBounds): string[] => {
    const ids: string[] = [];
    for (const building of state.buildings.values()) {
        if (isWorldRectVisible(viewBounds, building.tileX * TILE, building.tileY * TILE, TILE * 3, TILE * 3)) {
            ids.push(building.id);
        }
    }
    return ids;
};

const resolveResearchStripBuildingIds = (state: ClientState, visibleBuildingIds: ReadonlyArray<string>): string[] => {
    const ids: string[] = [];
    for (const buildingId of visibleBuildingIds) {
        const building = state.buildings.get(buildingId);
        if (building && isResearchBuildingType(building.type)) {
            ids.push(buildingId);
        }
    }
    return ids;
};

const syncResearchStripSprites = (
    state: ClientState,
    layers: SceneLayers,
    researchStripBuildingIds: string[]
): void => {
    syncEntityCache(layers.researchStripSprites, layers.buildingUnderlayLayer, researchStripBuildingIds, () => new Sprite());
    for (const buildingId of researchStripBuildingIds) {
        const building = state.buildings.get(buildingId);
        const sprite = layers.researchStripSprites.get(buildingId);
        if (!building || !(sprite instanceof Sprite)) {
            continue;
        }
        const frame = resolveResearchStripTexture(state, layers.textures, building.type, building.cityId);
        if (!frame) {
            sprite.visible = false;
            continue;
        }
        const placement = resolveResearchStripPlacement(building.tileX, building.tileY);
        if (sprite.texture !== frame) {
            sprite.texture = frame;
        }
        sprite.position.set(placement.x, placement.y);
        sprite.width = placement.width;
        sprite.height = placement.height;
        sprite.alpha = 0.95;
        sprite.visible = true;
    }
};

const createFallbackBuildingEntity = (): Graphics => {
    const entity = new Graphics();
    entity.roundRect(0, 0, TILE * 3, TILE * 3, 3).fill(0x8e7a56);
    return entity;
};

const createBuildingEntity = (layers: SceneLayers, state: ClientState): Sprite | Graphics => {
    const firstBuilding = state.buildings.values().next().value;
    if (!firstBuilding) {
        return createFallbackBuildingEntity();
    }
    const texture = resolveBuildingTexture(
        layers.textures,
        firstBuilding.type,
        null,
        resolveBuildingBaseFrame,
        resolveBuildingAnimationFrameX,
        getFrameTexture
    );
    return texture ? new Sprite(texture) : createFallbackBuildingEntity();
};

const syncBuildingSprites = (
    state: ClientState,
    layers: SceneLayers,
    animationCounter: number,
    visibleBuildingIds: string[]
): void => {
    syncEntityCache(layers.buildingSprites, layers.objectLayer, visibleBuildingIds, () => createBuildingEntity(layers, state));
    for (const buildingId of visibleBuildingIds) {
        const building = state.buildings.get(buildingId);
        let sprite = layers.buildingSprites.get(buildingId);
        if (!building || !sprite) {
            continue;
        }
        const frame = resolveBuildingTexture(
            layers.textures,
            building.type,
            animationCounter,
            resolveBuildingBaseFrame,
            resolveBuildingAnimationFrameX,
            getFrameTexture
        );
        if (!(sprite instanceof Sprite) && frame) {
            const upgraded = new Sprite(frame);
            upgraded.position.set(sprite.position.x, sprite.position.y);
            replaceEntityInLayer(layers.objectLayer, sprite, upgraded);
            layers.buildingSprites.set(buildingId, upgraded);
            sprite = upgraded;
        }
        if (sprite instanceof Sprite && frame && sprite.texture !== frame) {
            sprite.texture = frame;
        }
        sprite.position.set(building.tileX * TILE, building.tileY * TILE);
    }
};

const resolveOverlayBuildingIds = (state: ClientState, visibleBuildingIds: ReadonlyArray<string>): string[] => {
    const ids: string[] = [];
    for (const buildingId of visibleBuildingIds) {
        const building = state.buildings.get(buildingId);
        if (building && resolveBuildingOverlay(building.type) !== null) {
            ids.push(buildingId);
        }
    }
    return ids;
};

const syncBuildingOverlaySprites = (state: ClientState, layers: SceneLayers, overlayBuildingIds: string[]): void => {
    syncEntityCache(layers.buildingOverlaySprites, layers.objectLayer, overlayBuildingIds, () => new Sprite());
    for (const buildingId of overlayBuildingIds) {
        const building = state.buildings.get(buildingId);
        const sprite = layers.buildingOverlaySprites.get(buildingId);
        if (!building || !(sprite instanceof Sprite)) {
            continue;
        }
        const overlay = resolveBuildingOverlay(building.type);
        if (!overlay) {
            continue;
        }
        const frame = getFrameTexture(
            layers.textures.items,
            `building-overlay:${overlay.iconIndex}`,
            overlay.iconIndex * 32,
            0,
            32,
            32
        );
        if (frame && sprite.texture !== frame) {
            sprite.texture = frame;
        }
        sprite.position.set((building.tileX * TILE) + overlay.offset.x, (building.tileY * TILE) + overlay.offset.y);
    }
};

export const syncWorldBuildingSprites = (
    state: ClientState,
    layers: SceneLayers,
    viewBounds: WorldViewBounds,
    animationCounter: number
): void => {
    const visibleBuildingIds = resolveVisibleBuildingIds(state, viewBounds);
    syncResearchStripSprites(state, layers, resolveResearchStripBuildingIds(state, visibleBuildingIds));
    syncBuildingSprites(state, layers, animationCounter, visibleBuildingIds);
    syncBuildingOverlaySprites(state, layers, resolveOverlayBuildingIds(state, visibleBuildingIds));
};
