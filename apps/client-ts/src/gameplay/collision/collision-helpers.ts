import { tileToRect, type BlockingRect } from "@battlecity/sim-core";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;
const BUILDING_FOOTPRINT_TILES = 3;
const MAP_COLLISION_RADIUS_TILES = 14;

export const collectBlockingRects = (state: ClientState): BlockingRect[] => {
    const blocks: BlockingRect[] = [];
    for (const building of state.buildings.values()) {
        blocks.push({
            x: building.tileX * TILE_SIZE,
            y: building.tileY * TILE_SIZE,
            width: TILE_SIZE * BUILDING_FOOTPRINT_TILES,
            height: TILE_SIZE * BUILDING_FOOTPRINT_TILES
        });
    }
    for (const defense of state.defenses.values()) {
        blocks.push(tileToRect(defense.tileX, defense.tileY, TILE_SIZE));
    }
    const centerTileX = Math.floor(state.local.x / TILE_SIZE);
    const centerTileY = Math.floor(state.local.y / TILE_SIZE);
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
