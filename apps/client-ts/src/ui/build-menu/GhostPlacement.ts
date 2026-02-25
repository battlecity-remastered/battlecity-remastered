import type { ClientState } from "../../app/state.js";
import { TILE_SIZE, resolvePointerWorldPosition } from "../../gameplay/world-viewport.js";

export const BUILDING_FOOTPRINT_TILES = 3;
const HALF_FOOTPRINT_PIXELS = (BUILDING_FOOTPRINT_TILES * TILE_SIZE) / 2;

export type GhostPlacement = {
    tileX: number;
    tileY: number;
    blocked: boolean;
    buildType: number;
};

const overlapsFootprint = (
    leftA: number,
    topA: number,
    leftB: number,
    topB: number
): boolean => {
    return leftA < (leftB + BUILDING_FOOTPRINT_TILES)
        && (leftA + BUILDING_FOOTPRINT_TILES) > leftB
        && topA < (topB + BUILDING_FOOTPRINT_TILES)
        && (topA + BUILDING_FOOTPRINT_TILES) > topB;
};

const footprintContains = (originX: number, originY: number, tileX: number, tileY: number): boolean => {
    return tileX >= originX
        && tileX < (originX + BUILDING_FOOTPRINT_TILES)
        && tileY >= originY
        && tileY < (originY + BUILDING_FOOTPRINT_TILES);
};

const hasBlockingTerrainFootprint = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    const blockingTiles = state.world.buildBlockingTiles.size > 0
        ? state.world.buildBlockingTiles
        : state.world.blockingTiles;
    const maxTile = state.world.mapSize - 1;
    for (let dx = 0; dx < BUILDING_FOOTPRINT_TILES; dx += 1) {
        for (let dy = 0; dy < BUILDING_FOOTPRINT_TILES; dy += 1) {
            const tx = tileX + dx;
            const ty = tileY + dy;
            if (tx < 0 || ty < 0 || tx > maxTile || ty > maxTile) {
                return true;
            }
            if (blockingTiles.has(`${tx},${ty}`)) {
                return true;
            }
        }
    }
    return false;
};

const hasBlockingBuildingFootprint = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    for (const building of state.buildings.values()) {
        if (overlapsFootprint(tileX, tileY, building.tileX, building.tileY)) {
            return true;
        }
    }
    return false;
};

const hasBlockingDefenseFootprint = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    for (const defense of state.defenses.values()) {
        if (footprintContains(tileX, tileY, defense.tileX, defense.tileY)) {
            return true;
        }
    }
    return false;
};

export const isGhostTileBlocked = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    return hasBlockingTerrainFootprint(state, tileX, tileY)
        || hasBlockingBuildingFootprint(state, tileX, tileY)
        || hasBlockingDefenseFootprint(state, tileX, tileY);
};

export const resolveBuildPlacementTile = (state: ClientState): { tileX: number; tileY: number; } | null => {
    const pointerWorld = resolvePointerWorldPosition(state);
    if (!pointerWorld.insideWorld) {
        return null;
    }
    const topLeftX = pointerWorld.x - HALF_FOOTPRINT_PIXELS;
    const topLeftY = pointerWorld.y - HALF_FOOTPRINT_PIXELS;
    return {
        tileX: Math.floor(topLeftX / TILE_SIZE),
        tileY: Math.floor(topLeftY / TILE_SIZE)
    };
};

export const resolveGhostPlacement = (state: ClientState): GhostPlacement | null => {
    if (!state.ui.buildGhostMode) {
        return null;
    }
    const placementTile = resolveBuildPlacementTile(state);
    if (!placementTile) {
        return null;
    }
    return {
        tileX: placementTile.tileX,
        tileY: placementTile.tileY,
        blocked: isGhostTileBlocked(state, placementTile.tileX, placementTile.tileY),
        buildType: state.ui.selectedBuildType
    };
};
