import { Graphics, Sprite, Text, type Container, type Texture } from "pixi.js";
import { reconcileEntityCache } from "./entity-cache.js";
import type { SceneLayers } from "./scene-layers.js";

export type RenderableEntity = Graphics | Sprite;
export type CacheEntity = Graphics | Sprite | Text;

export const syncEntityCache = <T extends CacheEntity>(
    cache: Map<string, T>,
    layer: Container,
    ids: Iterable<string>,
    create: () => T
): void => {
    reconcileEntityCache(
        cache,
        ids,
        () => {
            const entity = create();
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

export const replaceEntityInLayer = (
    layer: Container,
    current: CacheEntity,
    replacement: CacheEntity
): void => {
    const currentIndex = layer.children.includes(current) ? layer.getChildIndex(current) : -1;
    if (currentIndex >= 0) {
        layer.removeChild(current);
        layer.addChildAt(replacement, currentIndex);
    } else {
        layer.addChild(replacement);
    }
    current.destroy();
};

export const resolveBuildingTexture = (
    textures: SceneLayers["textures"],
    buildingType: number,
    animateFrameCounter: number | null,
    resolveBuildingBaseFrame: (buildingType: number) => { x: number; y: number; width: number; height: number; },
    resolveBuildingAnimationFrameX: (animateFrameCounter: number) => number,
    getFrameTexture: (
        texture: Texture | null,
        cacheKey: string,
        x: number,
        y: number,
        width: number,
        height: number
    ) => Texture | null
): Texture | null => {
    const baseFrame = resolveBuildingBaseFrame(buildingType);
    const frameX = animateFrameCounter === null ? baseFrame.x : resolveBuildingAnimationFrameX(animateFrameCounter);
    return getFrameTexture(
        textures.buildings,
        `building:${buildingType}:${frameX}`,
        frameX,
        baseFrame.y,
        baseFrame.width,
        baseFrame.height
    );
};
