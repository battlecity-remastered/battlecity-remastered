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
        sprites: new Map<string, Sprite>()
    };
    texturedTileStateByLayer.set(layer, created);
    return created;
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
    buildingTexture: Texture | null = null
): void => {
    sprite.clear();
    const texturedTileState = ensureTexturedTileState(layer, sprite);
    const texturedTileKeys = new Set<string>();
    const centerTileX = Math.floor(cameraX / TILE_SIZE);
    const centerTileY = Math.floor(cameraY / TILE_SIZE);

    for (let tx = centerTileX - TILE_DRAW_RADIUS; tx <= centerTileX + TILE_DRAW_RADIUS; tx += 1) {
        for (let ty = centerTileY - TILE_DRAW_RADIUS; ty <= centerTileY + TILE_DRAW_RADIUS; ty += 1) {
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

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
