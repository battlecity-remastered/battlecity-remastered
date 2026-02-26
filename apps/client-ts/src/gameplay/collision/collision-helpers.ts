import { tileToRect, type BlockingRect } from "@battlecity/sim-core";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;
const BUILDING_FOOTPRINT_TILES = 3;
const MAP_COLLISION_RADIUS_TILES = 14;
const PLAYER_SPRITE_HALF = TILE_SIZE / 2;

const resolveBlockingHeightTiles = (buildingType: number): number => {
    if (!Number.isFinite(buildingType)) {
        return BUILDING_FOOTPRINT_TILES;
    }
    if (buildingType === 0) {
        return 2;
    }
    if (buildingType >= 100) {
        const family = Math.floor(buildingType / 100);
        return family <= 2 ? 2 : BUILDING_FOOTPRINT_TILES;
    }
    return BUILDING_FOOTPRINT_TILES;
};

export const collectBlockingRects = (state: ClientState): BlockingRect[] => {
    const blocks: BlockingRect[] = [];
    for (const building of state.buildings.values()) {
        const blockingHeightTiles = resolveBlockingHeightTiles(building.type);
        blocks.push({
            x: building.tileX * TILE_SIZE,
            y: building.tileY * TILE_SIZE,
            width: TILE_SIZE * BUILDING_FOOTPRINT_TILES,
            height: TILE_SIZE * blockingHeightTiles
        });
    }
    for (const defense of state.defenses.values()) {
        blocks.push(tileToRect(defense.tileX, defense.tileY, TILE_SIZE));
    }
    const centerTileX = Math.floor((state.local.x + PLAYER_SPRITE_HALF) / TILE_SIZE);
    const centerTileY = Math.floor((state.local.y + PLAYER_SPRITE_HALF) / TILE_SIZE);
    const minTileX = Math.max(0, centerTileX - MAP_COLLISION_RADIUS_TILES);
    const minTileY = Math.max(0, centerTileY - MAP_COLLISION_RADIUS_TILES);
    const maxTileX = Math.min(state.world.mapSize - 1, centerTileX + MAP_COLLISION_RADIUS_TILES);
    const maxTileY = Math.min(state.world.mapSize - 1, centerTileY + MAP_COLLISION_RADIUS_TILES);
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            if (!state.world.blockingTiles.has(`${tileX},${tileY}`)) {
                continue;
            }
            blocks.push(tileToRect(tileX, tileY, TILE_SIZE));
        }
    }
    return blocks;
};
