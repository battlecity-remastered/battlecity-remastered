import { Container, Graphics, Sprite, type Texture } from "pixi.js";
import type { LoadedMap } from "../../world/map-loader.js";
import { getFrameTexture } from "../TextureRegistry.js";
import {
    resolveTerrainFrameOffset,
    TILE_DRAW_RADIUS,
    TILE_SIZE
} from "./terrain-parity-helpers.js";
import {
    isRenderStateUnchanged,
    resolveTextureSize,
    updateRenderSnapshot,
    type TileLayerRenderSnapshot
} from "./tile-layer-state.js";
const MAP_SQUARE_LAVA = 1;
const MAP_SQUARE_ROCK = 2;
const MAP_SQUARE_BUILDING = 3;
const BUILDING_FRAME_SIZE = TILE_SIZE * 3;

type TexturedTileState = {
    layer: Container;
    sprites: Map<string, Sprite>;
    snapshot: TileLayerRenderSnapshot;
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
        snapshot: {
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
        }
    };
    texturedTileStateByLayer.set(layer, created);
    return created;
};

const resolveTextureUid = (texture: Texture | null): number => {
    return texture?.source?.uid ?? -1;
};

type TextureRenderMetadata = {
    uid: number;
    width: number;
    height: number;
};

const resolveTextureRenderMetadata = (texture: Texture | null): TextureRenderMetadata => {
    const size = resolveTextureSize(texture?.width ?? null, texture?.height ?? null);
    return {
        uid: resolveTextureUid(texture),
        width: size.width,
        height: size.height
    };
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

type TileLayerRenderConfig = {
    mapData: LoadedMap;
    centerTileX: number;
    centerTileY: number;
    drawRadiusX: number;
    drawRadiusY: number;
    rockTextureMeta: TextureRenderMetadata;
    lavaTextureMeta: TextureRenderMetadata;
    buildingTextureMeta: TextureRenderMetadata;
};

const shouldSkipTileLayerRender = (
    config: TileLayerRenderConfig,
    texturedTileState: TexturedTileState,
    layer: Container,
    sprite: Graphics
): boolean => {
    const unchanged = isRenderStateUnchanged(
        texturedTileState.snapshot,
        config.mapData,
        config.centerTileX,
        config.centerTileY,
        config.rockTextureMeta.uid,
        config.lavaTextureMeta.uid,
        config.buildingTextureMeta.uid,
        config.rockTextureMeta.width,
        config.rockTextureMeta.height,
        config.lavaTextureMeta.width,
        config.lavaTextureMeta.height,
        config.buildingTextureMeta.width,
        config.buildingTextureMeta.height,
        config.drawRadiusX,
        config.drawRadiusY
    );
    if (!unchanged) {
        return false;
    }
    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
    return true;
};

const renderVisibleTiles = (
    config: TileLayerRenderConfig,
    sprite: Graphics,
    texturedTileState: TexturedTileState,
    rockTexture: Texture | null,
    lavaTexture: Texture | null,
    buildingTexture: Texture | null
): Set<string> => {
    const texturedTileKeys = new Set<string>();
    for (let tx = config.centerTileX - config.drawRadiusX; tx <= config.centerTileX + config.drawRadiusX; tx += 1) {
        for (let ty = config.centerTileY - config.drawRadiusY; ty <= config.centerTileY + config.drawRadiusY; ty += 1) {
            const key = `${tx},${ty}`;
            const textured = renderTileAt({
                mapData: config.mapData,
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
    return texturedTileKeys;
};

const updateTileLayerSnapshot = (
    config: TileLayerRenderConfig,
    texturedTileState: TexturedTileState
): void => {
    updateRenderSnapshot(
        texturedTileState.snapshot,
        config.mapData,
        config.centerTileX,
        config.centerTileY,
        config.rockTextureMeta.uid,
        config.lavaTextureMeta.uid,
        config.buildingTextureMeta.uid,
        config.rockTextureMeta.width,
        config.rockTextureMeta.height,
        config.lavaTextureMeta.width,
        config.lavaTextureMeta.height,
        config.buildingTextureMeta.width,
        config.buildingTextureMeta.height,
        config.drawRadiusX,
        config.drawRadiusY
    );
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
    const config: TileLayerRenderConfig = {
        mapData,
        centerTileX: Math.floor(cameraX / TILE_SIZE),
        centerTileY: Math.floor(cameraY / TILE_SIZE),
        drawRadiusX,
        drawRadiusY,
        rockTextureMeta: resolveTextureRenderMetadata(rockTexture),
        lavaTextureMeta: resolveTextureRenderMetadata(lavaTexture),
        buildingTextureMeta: resolveTextureRenderMetadata(buildingTexture)
    };

    if (shouldSkipTileLayerRender(config, texturedTileState, layer, sprite)) {
        return;
    }

    sprite.clear();
    const texturedTileKeys = renderVisibleTiles(
        config,
        sprite,
        texturedTileState,
        rockTexture,
        lavaTexture,
        buildingTexture
    );
    pruneTexturedTileSprites(texturedTileState, texturedTileKeys);
    updateTileLayerSnapshot(config, texturedTileState);

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
