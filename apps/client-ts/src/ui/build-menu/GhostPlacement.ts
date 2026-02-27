import type { ClientState } from "../../app/state.js";
import {
    BUILDING_FOOTPRINT_TILES,
    hasDefenseInFootprint,
    hasOverlappingBuildingFootprint
} from "@battlecity/sim-core";
import { TILE_SIZE, resolvePointerWorldPosition } from "../../gameplay/world-viewport.js";

const HALF_FOOTPRINT_PIXELS = (BUILDING_FOOTPRINT_TILES * TILE_SIZE) / 2;

export type GhostPlacement = {
    tileX: number;
    tileY: number;
    blocked: boolean;
    buildType: number;
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
    return hasOverlappingBuildingFootprint(state.buildings.values(), tileX, tileY, BUILDING_FOOTPRINT_TILES);
};

const hasBlockingDefenseFootprint = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    return hasDefenseInFootprint(state.defenses.values(), tileX, tileY, BUILDING_FOOTPRINT_TILES);
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
