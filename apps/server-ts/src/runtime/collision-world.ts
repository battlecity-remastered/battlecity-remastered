import { tileToRect, type BlockingRect, type CollisionWorld } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimeState } from "./types.js";
import { resolveBuildingBlockingHeightTiles } from "./blocking-height.js";

const BUILDING_FOOTPRINT_TILES = 3;
const MAP_COLLISION_RADIUS_TILES = 14;

export const collectCollisionBlockingRects = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld["blocks"] => {
    const blocks: BlockingRect[] = [];

    for (const building of state.buildings.values()) {
        if (!Number.isFinite(building.tileX) || !Number.isFinite(building.tileY)) {
            continue;
        }
        const blockingHeightTiles = resolveBuildingBlockingHeightTiles(building.type);
        blocks.push({
            x: Math.floor(building.tileX) * config.tileSize,
            y: Math.floor(building.tileY) * config.tileSize,
            width: config.tileSize * BUILDING_FOOTPRINT_TILES,
            height: config.tileSize * blockingHeightTiles
        });
    }

    for (const defense of state.defenses.values()) {
        if (!Number.isFinite(defense.tileX) || !Number.isFinite(defense.tileY)) {
            continue;
        }
        blocks.push(tileToRect(Math.floor(defense.tileX), Math.floor(defense.tileY), config.tileSize));
    }

    const mapSize = Math.max(1, Math.floor(config.mapMax / config.tileSize));
    const centerTileX = Math.floor(centerX / config.tileSize);
    const centerTileY = Math.floor(centerY / config.tileSize);
    const minTileX = Math.max(0, centerTileX - MAP_COLLISION_RADIUS_TILES);
    const minTileY = Math.max(0, centerTileY - MAP_COLLISION_RADIUS_TILES);
    const maxTileX = Math.min(mapSize - 1, centerTileX + MAP_COLLISION_RADIUS_TILES);
    const maxTileY = Math.min(mapSize - 1, centerTileY + MAP_COLLISION_RADIUS_TILES);

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            if (!state.blockingTiles.has(`${tileX},${tileY}`)) {
                continue;
            }
            blocks.push(tileToRect(tileX, tileY, config.tileSize));
        }
    }

    return blocks;
};

export const buildCollisionWorld = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld => {
    return {
        maxX: config.mapMax,
        maxY: config.mapMax,
        blocks: collectCollisionBlockingRects(state, config, centerX, centerY)
    };
};
