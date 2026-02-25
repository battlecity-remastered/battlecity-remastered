import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { LoadedMap } from "../../world/map-loader.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import {
    resolveTerrainFrameOffset,
    TILE_DRAW_RADIUS,
    TILE_SIZE
} from "./terrain-parity-helpers.js";
const MAP_SQUARE_LAVA = 1;
const MAP_SQUARE_ROCK = 2;
const MAP_SQUARE_BUILDING = 3;
const BUILDING_FRAME_SIZE = TILE_SIZE * 3;

type TexturedTileState = {
    layer: Container;
    sprites: Map<string, Sprite>;
    lastCenterTileX: number | null;
    lastCenterTileY: number | null;
    lastMapRef: ReadonlyArray<ReadonlyArray<number>> | null;
    lastRockTextureUid: number;
    lastLavaTextureUid: number;
    lastBuildingTextureUid: number;
    lastDrawRadiusX: number;
    lastDrawRadiusY: number;
};

const texturedTileStateByLayer = new WeakMap<Container, TexturedTileState>();

const terrainColor = (tileValue: number): number | null => {
    if (tileValue === MAP_SQUARE_ROCK) {
        return 0x7e6746;
    }
    if (tileValue === MAP_SQUARE_LAVA) {
        return 0x6b5a45;
    }
    return null;
};

const isInsideMap = (mapData: LoadedMap, tileX: number, tileY: number): boolean => {
    return tileX >= 0 && tileY >= 0 && tileX < mapData.map.length && tileY < mapData.map.length;
};

const ensureTexturedTileState = (layer: Container, anchor: Graphics): TexturedTileState => {
    const existing = texturedTileStateByLayer.get(layer);
    if (existing) {
        return existing;
    }
    const textureLayer = new Container();
    const anchorIndex = layer.children.indexOf(anchor);
    const insertIndex = anchorIndex >= 0 ? anchorIndex + 1 : layer.children.length;
    layer.addChildAt(textureLayer, Math.min(insertIndex, layer.children.length));
    const created = {
        layer: textureLayer,
        sprites: new Map<string, Sprite>(),
        lastCenterTileX: null,
        lastCenterTileY: null,
        lastMapRef: null,
        lastRockTextureUid: -1,
        lastLavaTextureUid: -1,
        lastBuildingTextureUid: -1,
        lastDrawRadiusX: -1,
        lastDrawRadiusY: -1
    };
    texturedTileStateByLayer.set(layer, created);
    return created;
};

const resolveTextureUid = (texture: Texture | null): number => {
    return texture?.source?.uid ?? -1;
};

const syncTexturedTileSprite = (
    state: TexturedTileState,
    key: string,
    frame: Texture,
    x: number,
    y: number,
    width: number,
    height: number
): void => {
    let tileSprite = state.sprites.get(key);
    if (!tileSprite) {
        tileSprite = new Sprite(frame);
        state.layer.addChild(tileSprite);
        state.sprites.set(key, tileSprite);
    } else {
        tileSprite.texture = frame;
    }
    tileSprite.position.set(x, y);
    tileSprite.width = width;
    tileSprite.height = height;
};

const pruneTexturedTileSprites = (
    state: TexturedTileState,
    keepKeys: Set<string>
): void => {
    for (const [key, tileSprite] of state.sprites.entries()) {
        if (keepKeys.has(key)) {
            continue;
        }
        state.layer.removeChild(tileSprite);
        tileSprite.destroy();
        state.sprites.delete(key);
    }
};

export const renderTileLayer = (
    mapData: LoadedMap,
    cameraX: number,
    cameraY: number,
    layer: Container,
    sprite: Graphics,
    rockTexture: Texture | null = null,
    lavaTexture: Texture | null = null,
    buildingTexture: Texture | null = null,
    drawRadiusX: number = TILE_DRAW_RADIUS,
    drawRadiusY: number = TILE_DRAW_RADIUS
): void => {
    const texturedTileState = ensureTexturedTileState(layer, sprite);
    const centerTileX = Math.floor(cameraX / TILE_SIZE);
    const centerTileY = Math.floor(cameraY / TILE_SIZE);
    const rockTextureUid = resolveTextureUid(rockTexture);
    const lavaTextureUid = resolveTextureUid(lavaTexture);
    const buildingTextureUid = resolveTextureUid(buildingTexture);
    const unchanged = texturedTileState.lastCenterTileX === centerTileX
        && texturedTileState.lastCenterTileY === centerTileY
        && texturedTileState.lastMapRef === mapData.map
        && texturedTileState.lastRockTextureUid === rockTextureUid
        && texturedTileState.lastLavaTextureUid === lavaTextureUid
        && texturedTileState.lastBuildingTextureUid === buildingTextureUid
        && texturedTileState.lastDrawRadiusX === drawRadiusX
        && texturedTileState.lastDrawRadiusY === drawRadiusY;
    if (unchanged) {
        if (!layer.children.includes(sprite)) {
            layer.addChild(sprite);
        }
        return;
    }

    sprite.clear();
    const texturedTileKeys = new Set<string>();

    for (let tx = centerTileX - drawRadiusX; tx <= centerTileX + drawRadiusX; tx += 1) {
        for (let ty = centerTileY - drawRadiusY; ty <= centerTileY + drawRadiusY; ty += 1) {
            const key = `${tx},${ty}`;
            if (!isInsideMap(mapData, tx, ty)) {
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill(0x000000);
                continue;
            }
            const value = mapData.map[tx]?.[ty] ?? 0;
            if (value === MAP_SQUARE_BUILDING) {
                const frame = getFrameTexture(
                    buildingTexture,
                    "building:command-center",
                    0,
                    0,
                    BUILDING_FRAME_SIZE,
                    BUILDING_FRAME_SIZE
                );
                if (frame) {
                    syncTexturedTileSprite(
                        texturedTileState,
                        key,
                        frame,
                        tx * TILE_SIZE,
                        ty * TILE_SIZE,
                        BUILDING_FRAME_SIZE,
                        BUILDING_FRAME_SIZE
                    );
                    texturedTileKeys.add(key);
                } else {
                    sprite
                        .rect(tx * TILE_SIZE, ty * TILE_SIZE, BUILDING_FRAME_SIZE, BUILDING_FRAME_SIZE)
                        .fill(0x8f7757);
                }
                continue;
            }
            const baseTexture = value === MAP_SQUARE_ROCK ? rockTexture : value === MAP_SQUARE_LAVA ? lavaTexture : null;
            if (baseTexture) {
                const frameOffset = resolveTerrainFrameOffset(mapData, tx, ty, value);
                const frame = getFrameTexture(
                    baseTexture,
                    `terrain:${value}:${frameOffset}`,
                    frameOffset,
                    0,
                    TILE_SIZE,
                    TILE_SIZE
                );
                if (!frame) {
                    continue;
                }
                syncTexturedTileSprite(
                    texturedTileState,
                    key,
                    frame,
                    tx * TILE_SIZE,
                    ty * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE
                );
                texturedTileKeys.add(key);
            } else {
                const fill = terrainColor(value);
                if (fill === null) {
                    continue;
                }
                sprite
                    .rect(tx * TILE_SIZE, ty * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill(fill);
            }
        }
    }
    pruneTexturedTileSprites(texturedTileState, texturedTileKeys);
    texturedTileState.lastCenterTileX = centerTileX;
    texturedTileState.lastCenterTileY = centerTileY;
    texturedTileState.lastMapRef = mapData.map;
    texturedTileState.lastRockTextureUid = rockTextureUid;
    texturedTileState.lastLavaTextureUid = lavaTextureUid;
    texturedTileState.lastBuildingTextureUid = buildingTextureUid;
    texturedTileState.lastDrawRadiusX = drawRadiusX;
    texturedTileState.lastDrawRadiusY = drawRadiusY;

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
