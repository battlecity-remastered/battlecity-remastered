import type { ClientState } from "../../app/state.js";
import { TILE } from "../../render/parity/constants.js";
import {
    hasBlockingBuildingAtTile,
    hasPositionedEntityAtTile,
    hasTileEntityAt
} from "@battlecity/sim-core";

const PLAYER_HITBOX_PADDING = 8;
const PLAYER_HITBOX_SIZE = TILE - (2 * PLAYER_HITBOX_PADDING);
const WORLD_TILE_MIN = 0;
const LEGACY_MAP_SIZE_TILES = 512;

const resolveMapSizeTiles = (state: ClientState): number => {
    if (Number.isFinite(state.world.mapSize) && state.world.mapSize > 0) {
        return Math.floor(state.world.mapSize);
    }
    return LEGACY_MAP_SIZE_TILES;
};

const hasBlockingBuilding = (state: ClientState, tileX: number, tileY: number): boolean => {
    return hasBlockingBuildingAtTile(state.buildings.values(), tileX, tileY);
};

const hasBlockingDefense = (state: ClientState, tileX: number, tileY: number): boolean => {
    return hasTileEntityAt(state.defenses.values(), tileX, tileY);
};

const hasBlockingHazard = (state: ClientState, tileX: number, tileY: number): boolean => {
    return hasPositionedEntityAtTile(state.hazards.values(), tileX, tileY, TILE);
};

const isOutOfBounds = (state: ClientState, tileX: number, tileY: number): boolean => {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return true;
    }
    const mapSize = resolveMapSizeTiles(state);
    return tileX < WORLD_TILE_MIN
        || tileY < WORLD_TILE_MIN
        || tileX >= mapSize
        || tileY >= mapSize;
};

export const resolvePlayerDominantTile = (state: ClientState): { tileX: number; tileY: number } => {
    const rectX = Math.trunc(state.local.x + PLAYER_HITBOX_PADDING);
    const rectY = Math.trunc(state.local.y + PLAYER_HITBOX_PADDING);
    const rectW = PLAYER_HITBOX_SIZE;
    const rectH = PLAYER_HITBOX_SIZE;
    const startX = Math.floor(rectX / TILE);
    const endX = Math.floor((rectX + rectW - 1) / TILE);
    const startY = Math.floor(rectY / TILE);
    const endY = Math.floor((rectY + rectH - 1) / TILE);
    const centerTileX = Math.floor((state.local.x + (TILE / 2)) / TILE);
    const centerTileY = Math.floor((state.local.y + (TILE / 2)) / TILE);

    let best: { tileX: number; tileY: number; area: number } | null = null;
    for (let tileX = startX; tileX <= endX; tileX += 1) {
        for (let tileY = startY; tileY <= endY; tileY += 1) {
            const tileLeft = tileX * TILE;
            const tileTop = tileY * TILE;
            const overlapW = Math.max(0, Math.min(rectX + rectW, tileLeft + TILE) - Math.max(rectX, tileLeft));
            const overlapH = Math.max(0, Math.min(rectY + rectH, tileTop + TILE) - Math.max(rectY, tileTop));
            const area = overlapW * overlapH;
            if (area <= 0) {
                continue;
            }
            if (!best || area > best.area || (area === best.area && tileX === centerTileX && tileY === centerTileY)) {
                best = { tileX, tileY, area };
            }
        }
    }
    if (best) {
        return { tileX: best.tileX, tileY: best.tileY };
    }
    return {
        tileX: centerTileX,
        tileY: centerTileY
    };
};

export const isHazardDropTileBlocked = (state: ClientState, tileX: number, tileY: number): boolean => {
    return isOutOfBounds(state, tileX, tileY)
        || state.world.blockingTiles.has(`${tileX},${tileY}`)
        || hasBlockingBuilding(state, tileX, tileY)
        || hasBlockingDefense(state, tileX, tileY)
        || hasBlockingHazard(state, tileX, tileY);
};

export const resolveHazardDropPlacement = (
    state: ClientState
): { tileX: number; tileY: number; x: number; y: number } | null => {
    const dominantTile = resolvePlayerDominantTile(state);
    if (isHazardDropTileBlocked(state, dominantTile.tileX, dominantTile.tileY)) {
        return null;
    }
    return {
        tileX: dominantTile.tileX,
        tileY: dominantTile.tileY,
        x: dominantTile.tileX * TILE,
        y: dominantTile.tileY * TILE
    };
};
