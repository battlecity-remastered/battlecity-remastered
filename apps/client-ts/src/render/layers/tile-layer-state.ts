import type { LoadedMap } from "../../world/map-loader.js";

export type TileLayerRenderSnapshot = {
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

export const resolveTextureSize = (width: number | null, height: number | null): { width: number; height: number; } => {
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return { width: -1, height: -1 };
    }
    return {
        width: Math.floor(width ?? -1),
        height: Math.floor(height ?? -1)
    };
};

export const isRenderStateUnchanged = (
    state: TileLayerRenderSnapshot,
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

export const updateRenderSnapshot = (
    state: TileLayerRenderSnapshot,
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
