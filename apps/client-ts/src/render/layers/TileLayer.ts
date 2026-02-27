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
    lastRockTextureWidth: number;
    lastRockTextureHeight: number;
    lastLavaTextureWidth: number;
    lastLavaTextureHeight: number;
    lastBuildingTextureWidth: number;
    lastBuildingTextureHeight: number;
    lastDrawRadiusX: number;
    lastDrawRadiusY: number;
};

type TileRenderParams = {
    mapData: LoadedMap;
    tx: number;
    ty: number;
    key: string;
    sprite: Graphics;
    texturedTileState: TexturedTileState;
    rockTexture: Texture | null;
    lavaTexture: Texture | null;
    buildingTexture: Texture | null;
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
        lastRockTextureWidth: -1,
        lastRockTextureHeight: -1,
        lastLavaTextureWidth: -1,
        lastLavaTextureHeight: -1,
        lastBuildingTextureWidth: -1,
        lastBuildingTextureHeight: -1,
        lastDrawRadiusX: -1,
        lastDrawRadiusY: -1
    };
    texturedTileStateByLayer.set(layer, created);
    return created;
};

const resolveTextureUid = (texture: Texture | null): number => {
    return texture?.source?.uid ?? -1;
};

const resolveTextureSize = (texture: Texture | null): { width: number; height: number; } => {
    if (!texture) {
        return { width: -1, height: -1 };
    }
    const width = Number.isFinite(texture.width) ? Math.floor(texture.width) : -1;
    const height = Number.isFinite(texture.height) ? Math.floor(texture.height) : -1;
    return { width, height };
};

const isRenderStateUnchanged = (
    state: TexturedTileState,
    mapData: LoadedMap,
    centerTileX: number,
    centerTileY: number,
    rockTextureUid: number,
    lavaTextureUid: number,
    buildingTextureUid: number,
    rockTextureWidth: number,
    rockTextureHeight: number,
    lavaTextureWidth: number,
    lavaTextureHeight: number,
    buildingTextureWidth: number,
    buildingTextureHeight: number,
    drawRadiusX: number,
    drawRadiusY: number
): boolean => {
    return state.lastCenterTileX === centerTileX
        && state.lastCenterTileY === centerTileY
        && state.lastMapRef === mapData.map
        && state.lastRockTextureUid === rockTextureUid
        && state.lastLavaTextureUid === lavaTextureUid
        && state.lastBuildingTextureUid === buildingTextureUid
        && state.lastRockTextureWidth === rockTextureWidth
        && state.lastRockTextureHeight === rockTextureHeight
        && state.lastLavaTextureWidth === lavaTextureWidth
        && state.lastLavaTextureHeight === lavaTextureHeight
        && state.lastBuildingTextureWidth === buildingTextureWidth
        && state.lastBuildingTextureHeight === buildingTextureHeight
        && state.lastDrawRadiusX === drawRadiusX
        && state.lastDrawRadiusY === drawRadiusY;
};

const drawColorTile = (
    sprite: Graphics,
    tx: number,
    ty: number,
    width: number,
    height: number,
    fill: number
): void => {
    sprite
        .rect(tx * TILE_SIZE, ty * TILE_SIZE, width, height)
        .fill(fill);
};

const renderBuildingTile = (params: TileRenderParams): boolean => {
    const frame = getFrameTexture(
        params.buildingTexture,
        "building:command-center",
        0,
        0,
        BUILDING_FRAME_SIZE,
        BUILDING_FRAME_SIZE
    );
    if (!frame) {
        drawColorTile(params.sprite, params.tx, params.ty, BUILDING_FRAME_SIZE, BUILDING_FRAME_SIZE, 0x8f7757);
        return false;
    }
    syncTexturedTileSprite(
        params.texturedTileState,
        params.key,
        frame,
        params.tx * TILE_SIZE,
        params.ty * TILE_SIZE,
        BUILDING_FRAME_SIZE,
        BUILDING_FRAME_SIZE
    );
    return true;
};

const renderTerrainTile = (params: TileRenderParams, value: number): boolean => {
    const baseTexture = value === MAP_SQUARE_ROCK ? params.rockTexture : value === MAP_SQUARE_LAVA ? params.lavaTexture : null;
    if (!baseTexture) {
        const fill = terrainColor(value);
        if (fill !== null) {
            drawColorTile(params.sprite, params.tx, params.ty, TILE_SIZE, TILE_SIZE, fill);
        }
        return false;
    }

    const frameOffset = resolveTerrainFrameOffset(params.mapData, params.tx, params.ty, value);
    const frame = getFrameTexture(
        baseTexture,
        `terrain:${value}:${frameOffset}`,
        frameOffset,
        0,
        TILE_SIZE,
        TILE_SIZE
    );
    if (!frame) {
        return false;
    }

    syncTexturedTileSprite(
        params.texturedTileState,
        params.key,
        frame,
        params.tx * TILE_SIZE,
        params.ty * TILE_SIZE,
        TILE_SIZE,
        TILE_SIZE
    );
    return true;
};

const renderTileAt = (params: TileRenderParams): boolean => {
    if (!isInsideMap(params.mapData, params.tx, params.ty)) {
        drawColorTile(params.sprite, params.tx, params.ty, TILE_SIZE, TILE_SIZE, 0x000000);
        return false;
    }

    const value = params.mapData.map[params.tx]?.[params.ty] ?? 0;
    if (value === MAP_SQUARE_BUILDING) {
        return renderBuildingTile(params);
    }
    return renderTerrainTile(params, value);
};

const updateRenderSnapshot = (
    state: TexturedTileState,
    mapData: LoadedMap,
    centerTileX: number,
    centerTileY: number,
    rockTextureUid: number,
    lavaTextureUid: number,
    buildingTextureUid: number,
    rockTextureWidth: number,
    rockTextureHeight: number,
    lavaTextureWidth: number,
    lavaTextureHeight: number,
    buildingTextureWidth: number,
    buildingTextureHeight: number,
    drawRadiusX: number,
    drawRadiusY: number
): void => {
    state.lastCenterTileX = centerTileX;
    state.lastCenterTileY = centerTileY;
    state.lastMapRef = mapData.map;
    state.lastRockTextureUid = rockTextureUid;
    state.lastLavaTextureUid = lavaTextureUid;
    state.lastBuildingTextureUid = buildingTextureUid;
    state.lastRockTextureWidth = rockTextureWidth;
    state.lastRockTextureHeight = rockTextureHeight;
    state.lastLavaTextureWidth = lavaTextureWidth;
    state.lastLavaTextureHeight = lavaTextureHeight;
    state.lastBuildingTextureWidth = buildingTextureWidth;
    state.lastBuildingTextureHeight = buildingTextureHeight;
    state.lastDrawRadiusX = drawRadiusX;
    state.lastDrawRadiusY = drawRadiusY;
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
    const rockSize = resolveTextureSize(rockTexture);
    const lavaSize = resolveTextureSize(lavaTexture);
    const buildingSize = resolveTextureSize(buildingTexture);
    const unchanged = isRenderStateUnchanged(
        texturedTileState,
        mapData,
        centerTileX,
        centerTileY,
        rockTextureUid,
        lavaTextureUid,
        buildingTextureUid,
        rockSize.width,
        rockSize.height,
        lavaSize.width,
        lavaSize.height,
        buildingSize.width,
        buildingSize.height,
        drawRadiusX,
        drawRadiusY
    );
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
            const textured = renderTileAt({
                mapData,
                tx,
                ty,
                key,
                sprite,
                texturedTileState,
                rockTexture,
                lavaTexture,
                buildingTexture
            });
            if (textured) {
                texturedTileKeys.add(key);
            }
        }
    }
    pruneTexturedTileSprites(texturedTileState, texturedTileKeys);
    updateRenderSnapshot(
        texturedTileState,
        mapData,
        centerTileX,
        centerTileY,
        rockTextureUid,
        lavaTextureUid,
        buildingTextureUid,
        rockSize.width,
        rockSize.height,
        lavaSize.width,
        lavaSize.height,
        buildingSize.width,
        buildingSize.height,
        drawRadiusX,
        drawRadiusY
    );

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
