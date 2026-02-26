import citySpawns from "../../../data/citySpawns.json" with { type: "json" };
import {
    advancePointByLegacyHeading32,
    clampToWorld,
    collidesAt,
    findNearestSafePoint,
    tileToRect,
    type BlockingRect,
    type CollisionPoint,
    type CollisionWorld
} from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

type CitySpawn = {
    tileX?: number;
    tileY?: number;
};

const CITY_SPAWNS = citySpawns as Record<string, CitySpawn>;
const BOT_RADIUS = 18;
const BOT_SPRITE_SIZE = 48;
const BOT_SPRITE_HALF = BOT_SPRITE_SIZE / 2;
const BUILDING_FOOTPRINT_TILES = 3;
const MAP_COLLISION_RADIUS_TILES = 14;

const normalizeHeading = (direction: number): number => {
    const normalized = Math.round(direction) % 32;
    return normalized < 0 ? normalized + 32 : normalized;
};

const toFinite = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
};

const resolveBlockingHeightTiles = (buildingType: number): number => {
    // Keep bot collision identical to player runtime rules.
    const family = Math.max(0, Math.floor(buildingType / 100));
    return family <= 2 ? 2 : BUILDING_FOOTPRINT_TILES;
};

const toCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x + BOT_SPRITE_HALF,
        y: y + BOT_SPRITE_HALF
    };
};

const fromCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x - BOT_SPRITE_HALF,
        y: y - BOT_SPRITE_HALF
    };
};

const clampTopLeftToWorld = (x: number, y: number, mapMax: number): CollisionPoint => {
    const max = mapMax - BOT_SPRITE_SIZE;
    return {
        x: Math.max(0, Math.min(max, x)),
        y: Math.max(0, Math.min(max, y))
    };
};

const collectBlockingRects = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld["blocks"] => {
    const blocks: BlockingRect[] = [];

    for (const building of state.buildings.values()) {
        const blockingHeightTiles = resolveBlockingHeightTiles(building.type);
        blocks.push({
            x: building.tileX * config.tileSize,
            y: building.tileY * config.tileSize,
            width: config.tileSize * BUILDING_FOOTPRINT_TILES,
            height: config.tileSize * blockingHeightTiles
        });
    }

    for (const defense of state.defenses.values()) {
        blocks.push(tileToRect(defense.tileX, defense.tileY, config.tileSize));
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

const buildCollisionWorld = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld => {
    return {
        maxX: config.mapMax,
        maxY: config.mapMax,
        blocks: collectBlockingRects(state, config, centerX, centerY)
    };
};

const resolveStartPoint = (world: CollisionWorld, center: CollisionPoint): CollisionPoint => {
    if (!collidesAt(world, center, BOT_RADIUS)) {
        return center;
    }
    return findNearestSafePoint(world, center, BOT_RADIUS, 8, 192) ?? clampToWorld(world, center, BOT_RADIUS);
};

const moveWithSlide = (world: CollisionWorld, current: CollisionPoint, desired: CollisionPoint): CollisionPoint => {
    const clampedDesired = clampToWorld(world, desired, BOT_RADIUS);
    if (!collidesAt(world, clampedDesired, BOT_RADIUS)) {
        return clampedDesired;
    }

    const slideX = clampToWorld(world, { x: clampedDesired.x, y: current.y }, BOT_RADIUS);
    if (!collidesAt(world, slideX, BOT_RADIUS)) {
        return slideX;
    }

    const slideY = clampToWorld(world, { x: current.x, y: clampedDesired.y }, BOT_RADIUS);
    if (!collidesAt(world, slideY, BOT_RADIUS)) {
        return slideY;
    }

    return clampToWorld(world, current, BOT_RADIUS);
};

export const resolveCityCenter = (cityId: number, config: RuntimeConfig): { x: number; y: number } => {
    const fromMap = CITY_SPAWNS[String(cityId)];
    const tileX = toFinite(fromMap?.tileX);
    const tileY = toFinite(fromMap?.tileY);
    if (tileX !== null && tileY !== null) {
        return {
            x: (Math.floor(tileX) * config.tileSize) + (config.tileSize * 1.5),
            y: (Math.floor(tileY) * config.tileSize) + (config.tileSize * 1.5)
        };
    }

    const side = Math.max(1, Math.round(Math.sqrt(Math.max(1, config.cityCount))));
    const gx = cityId % side;
    const gy = Math.floor(cityId / side);
    return {
        x: (gx + 1.5) * config.tileSize * 6,
        y: (gy + 1.5) * config.tileSize * 6
    };
};

export const nearestHumanPlayer = (
    state: RuntimeState,
    x: number,
    y: number,
    maxDistance: number,
    cityId?: number
): { id: string; x: number; y: number; city: number } | null => {
    let nearest: { id: string; x: number; y: number; city: number } | null = null;
    let nearestDistance = maxDistance * maxDistance;

    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        if (cityId !== undefined && player.city !== cityId) {
            continue;
        }
        const dx = player.x - x;
        const dy = player.y - y;
        const distance = (dx * dx) + (dy * dy);
        if (distance >= nearestDistance) {
            continue;
        }
        nearestDistance = distance;
        nearest = {
            id: player.id,
            x: player.x,
            y: player.y,
            city: player.city
        };
    }

    return nearest;
};

export const headingToTarget = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fallback: number
): number => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return normalizeHeading(fallback);
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return normalizeHeading(fallback);
    }
    const normX = dx / length;
    const normY = dy / length;
    const theta = Math.atan2(-normX, -normY);
    return normalizeHeading((-theta / Math.PI) * 16);
};

export const moveBotByHeading = (
    state: RuntimeState,
    config: RuntimeConfig,
    x: number,
    y: number,
    direction: number,
    speed: number,
    deltaMs: number
): { x: number; y: number } => {
    const normalizedDirection = normalizeHeading(direction);
    const currentCenter = toCollisionPoint(x, y);
    const world = buildCollisionWorld(state, config, currentCenter.x, currentCenter.y);
    const safeCenter = resolveStartPoint(world, currentCenter);
    const advancedCenter = advancePointByLegacyHeading32(
        safeCenter.x,
        safeCenter.y,
        normalizedDirection,
        speed,
        deltaMs
    );
    const resolvedCenter = moveWithSlide(world, safeCenter, advancedCenter);
    const topLeft = fromCollisionPoint(resolvedCenter.x, resolvedCenter.y);
    return clampTopLeftToWorld(topLeft.x, topLeft.y, config.mapMax);
};

export const normalizeBotHeading = (direction: number): number => {
    return normalizeHeading(direction);
};

export const legacyHeadingToBulletHeading = (direction: number): number => {
    return normalizeHeading(direction - 8);
};
