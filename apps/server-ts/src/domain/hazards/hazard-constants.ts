import {
    hasBlockingBuildingAtTile,
    hasPositionedEntityAtTile,
    hasTileEntityAt,
} from "@battlecity/sim-core";
import type { RuntimeHazard, RuntimeState } from "../../runtime/types.js";

export const TILE = 48;
export const TILE_INNER_PADDING = 8;
export const TILE_INNER_SIZE = TILE - (2 * TILE_INNER_PADDING);
export const ITEM_TYPE_CLOAK = 0;
export const ITEM_TYPE_ROCKET = 1;
export const ITEM_TYPE_MEDKIT = 2;
export const ITEM_TYPE_BOMB = 3;
export const ITEM_TYPE_MINE = 4;
export const ITEM_TYPE_FLARE = 6;
export const ITEM_TYPE_DFG = 7;
export const ITEM_TYPE_LASER = 12;
export const LEGACY_BOMB_FUSE_MS = 5000;
export const LEGACY_BOMB_DAMAGE = 25;
export const LEGACY_BOMB_PLAYER_TILE_RADIUS = 1;
export const LEGACY_BOMB_STRUCTURE_TILE_RADIUS = 1;
export const LEGACY_MINE_DAMAGE = 19;
export const LEGACY_TRIGGER_REVEAL_MS = 750;
export const LEGACY_DFG_FREEZE_MS = 5000;
export const BUILDING_FOOTPRINT_TILES = 3;
export const PASSIVE_DROP_RADIUS = TILE / 2;
export const WORLD_TILE_MIN = 0;
export const WORLD_TILE_MAX = 512;

export const PASSIVE_DROP_TYPES = new Set([
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_LASER
]);
export const EXPLOSIVE_HAZARD_TYPES = new Set([ITEM_TYPE_BOMB, ITEM_TYPE_MINE, ITEM_TYPE_DFG]);

export const isHazardType = (type: number): boolean => {
    return EXPLOSIVE_HAZARD_TYPES.has(type) || PASSIVE_DROP_TYPES.has(type);
};

export const snapToTile = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.floor(value / TILE) * TILE;
};

export const isOutOfBounds = (tileX: number, tileY: number): boolean => {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return true;
    }
    return tileX < WORLD_TILE_MIN || tileY < WORLD_TILE_MIN || tileX > WORLD_TILE_MAX || tileY > WORLD_TILE_MAX;
};

const hasBlockingBuilding = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    return hasBlockingBuildingAtTile(state.buildings.values(), tileX, tileY);
};

const hasBlockingDefense = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    return hasTileEntityAt(state.defenses.values(), tileX, tileY);
};

const hasBlockingHazard = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    return hasPositionedEntityAtTile(state.hazards.values(), tileX, tileY, TILE);
};

export const isHazardPlacementBlocked = (state: RuntimeState, tileX: number, tileY: number): boolean => {
    return isOutOfBounds(tileX, tileY)
        || state.blockingTiles.has(`${tileX},${tileY}`)
        || hasBlockingBuilding(state, tileX, tileY)
        || hasBlockingDefense(state, tileX, tileY)
        || hasBlockingHazard(state, tileX, tileY);
};

export const intersectsHazardTile = (
    playerX: number,
    playerY: number,
    hazardX: number,
    hazardY: number
): boolean => {
    const playerLeft = playerX + TILE_INNER_PADDING;
    const playerTop = playerY + TILE_INNER_PADDING;
    const playerRight = playerLeft + TILE_INNER_SIZE;
    const playerBottom = playerTop + TILE_INNER_SIZE;
    const hazardLeft = hazardX;
    const hazardTop = hazardY;
    const hazardRight = hazardLeft + TILE;
    const hazardBottom = hazardTop + TILE;
    return playerLeft < hazardRight
        && playerRight > hazardLeft
        && playerTop < hazardBottom
        && playerBottom > hazardTop;
};

export const shouldDamagePlayer = (
    hazard: RuntimeHazard,
    playerId: string,
    playerCityId: number
): boolean => {
    if (playerId === hazard.ownerId) {
        return false;
    }
    return playerCityId !== hazard.cityId;
};

export const toTileCenter = (value: number): number => {
    return Math.floor((value + (TILE / 2)) / TILE);
};

export const isWithinTileRadius = (
    tileX: number,
    tileY: number,
    centerTileX: number,
    centerTileY: number,
    radiusTiles: number
): boolean => {
    return Math.abs(tileX - centerTileX) <= radiusTiles
        && Math.abs(tileY - centerTileY) <= radiusTiles;
};
