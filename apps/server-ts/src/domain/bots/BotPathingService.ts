import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { resolveBuildingBlockingHeightTiles } from "../../runtime/blocking-height.js";
import {
    nearestPassableTile,
    resolvePathBounds,
    runAStar,
    type TilePoint
} from "./bot-path-search.js";

type PathOptions = {
    searchRadiusTiles: number;
    maxNodes: number;
    context?: BotPathContext | undefined;
};

export type BotPathContext = {
    blockedSetCache: Map<string, Set<string>>;
    stats: {
        blockedSetBuilds: number;
    };
};

export const createBotPathContext = (): BotPathContext => {
    return {
        blockedSetCache: new Map<string, Set<string>>(),
        stats: {
            blockedSetBuilds: 0
        }
    };
};

const BOT_HALF = 24;
const BOT_RADIUS = 18;
const BUILDING_FOOTPRINT_TILES = 3;

const tileKey = (x: number, y: number): string => `${x},${y}`;

const toTile = (value: number, tileSize: number): number => Math.floor(value / tileSize);

const inBounds = (tileX: number, tileY: number, maxTile: number): boolean => {
    return tileX >= 0 && tileY >= 0 && tileX <= maxTile && tileY <= maxTile;
};

const circleIntersectsRect = (
    centerX: number,
    centerY: number,
    radius: number,
    rectX: number,
    rectY: number,
    rectSize: number
): boolean => {
    const nearestX = Math.max(rectX, Math.min(centerX, rectX + rectSize));
    const nearestY = Math.max(rectY, Math.min(centerY, rectY + rectSize));
    const dx = centerX - nearestX;
    const dy = centerY - nearestY;
    return ((dx * dx) + (dy * dy)) <= (radius * radius);
};

const isTileBodyPassable = (
    blocked: Set<string>,
    tileX: number,
    tileY: number,
    tileSize: number,
    maxTile: number
): boolean => {
    if (!inBounds(tileX, tileY, maxTile)) {
        return false;
    }
    const centerX = (tileX * tileSize) + (tileSize / 2);
    const centerY = (tileY * tileSize) + (tileSize / 2);
    const clearanceTiles = Math.ceil(BOT_RADIUS / tileSize) + 1;

    for (let dx = -clearanceTiles; dx <= clearanceTiles; dx += 1) {
        for (let dy = -clearanceTiles; dy <= clearanceTiles; dy += 1) {
            const checkX = tileX + dx;
            const checkY = tileY + dy;
            if (!inBounds(checkX, checkY, maxTile) || !blocked.has(tileKey(checkX, checkY))) {
                continue;
            }
            if (circleIntersectsRect(centerX, centerY, BOT_RADIUS, checkX * tileSize, checkY * tileSize, tileSize)) {
                return false;
            }
        }
    }

    return true;
};

const addTerrainBlockingTiles = (
    state: RuntimeState,
    blocked: Set<string>,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number
): void => {
    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            if (state.blockingTiles.has(tileKey(tileX, tileY))) {
                blocked.add(tileKey(tileX, tileY));
            }
        }
    }
};

const addBuildingBlockingTiles = (
    state: RuntimeState,
    blocked: Set<string>,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number
): void => {
    for (const building of state.buildings.values()) {
        const minX = Math.max(minTileX, building.tileX);
        const maxX = Math.min(maxTileX, building.tileX + BUILDING_FOOTPRINT_TILES - 1);
        const heightTiles = resolveBuildingBlockingHeightTiles(building.type);
        const minY = Math.max(minTileY, building.tileY);
        const maxY = Math.min(maxTileY, building.tileY + heightTiles - 1);
        for (let tileX = minX; tileX <= maxX; tileX += 1) {
            for (let tileY = minY; tileY <= maxY; tileY += 1) {
                blocked.add(tileKey(tileX, tileY));
            }
        }
    }
};

const addDefenseBlockingTiles = (
    state: RuntimeState,
    blocked: Set<string>,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number
): void => {
    for (const defense of state.defenses.values()) {
        if (defense.tileX < minTileX || defense.tileX > maxTileX || defense.tileY < minTileY || defense.tileY > maxTileY) {
            continue;
        }
        blocked.add(tileKey(defense.tileX, defense.tileY));
    }
};

const addHazardBlockingTiles = (
    state: RuntimeState,
    config: RuntimeConfig,
    blocked: Set<string>,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number
): void => {
    for (const hazard of state.hazards.values()) {
        const tileX = toTile(hazard.x, config.tileSize);
        const tileY = toTile(hazard.y, config.tileSize);
        if (tileX < minTileX || tileX > maxTileX || tileY < minTileY || tileY > maxTileY) {
            continue;
        }
        blocked.add(tileKey(tileX, tileY));
    }
};

const buildBlockedSet = (
    state: RuntimeState,
    config: RuntimeConfig,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number
): Set<string> => {
    const blocked = new Set<string>();
    addTerrainBlockingTiles(state, blocked, minTileX, maxTileX, minTileY, maxTileY);
    addBuildingBlockingTiles(state, blocked, minTileX, maxTileX, minTileY, maxTileY);
    addDefenseBlockingTiles(state, blocked, minTileX, maxTileX, minTileY, maxTileY);
    addHazardBlockingTiles(state, config, blocked, minTileX, maxTileX, minTileY, maxTileY);
    return blocked;
};

const resolveBlockedSet = (
    state: RuntimeState,
    config: RuntimeConfig,
    minTileX: number,
    maxTileX: number,
    minTileY: number,
    maxTileY: number,
    context?: BotPathContext
): Set<string> => {
    if (!context) {
        return buildBlockedSet(state, config, minTileX, maxTileX, minTileY, maxTileY);
    }
    const key = `${minTileX}:${maxTileX}:${minTileY}:${maxTileY}`;
    const cached = context.blockedSetCache.get(key);
    if (cached) {
        return cached;
    }
    const blocked = buildBlockedSet(state, config, minTileX, maxTileX, minTileY, maxTileY);
    context.blockedSetCache.set(key, blocked);
    context.stats.blockedSetBuilds += 1;
    return blocked;
};

const resolvePassableResolver = (
    blocked: Set<string>,
    tileSize: number,
    maxTile: number
): ((tileX: number, tileY: number) => boolean) => {
    return (tileX: number, tileY: number) => isTileBodyPassable(blocked, tileX, tileY, tileSize, maxTile);
};

const toBotCenterTile = (x: number, y: number, tileSize: number): TilePoint => {
    return {
        x: toTile(x + BOT_HALF, tileSize),
        y: toTile(y + BOT_HALF, tileSize)
    };
};

export const findBotPath = (
    state: RuntimeState,
    config: RuntimeConfig,
    startTopLeftX: number,
    startTopLeftY: number,
    goalTopLeftX: number,
    goalTopLeftY: number,
    options: PathOptions
): Array<{ x: number; y: number }> | null => {
    const mapSizeTiles = Math.max(1, Math.floor(config.mapMax / config.tileSize));
    const maxTile = mapSizeTiles - 1;

    const startTile = toBotCenterTile(startTopLeftX, startTopLeftY, config.tileSize);
    const goalTile = toBotCenterTile(goalTopLeftX, goalTopLeftY, config.tileSize);
    const bounds = resolvePathBounds(startTile, goalTile, maxTile, options.searchRadiusTiles);

    const blocked = resolveBlockedSet(
        state,
        config,
        bounds.minTileX,
        bounds.maxTileX,
        bounds.minTileY,
        bounds.maxTileY,
        options.context
    );
    const isPassable = resolvePassableResolver(blocked, config.tileSize, maxTile);

    const start = nearestPassableTile(startTile, 6, isPassable);
    const goal = nearestPassableTile(goalTile, 8, isPassable);
    if (!start || !goal) {
        return null;
    }

    return runAStar(start, goal, bounds, isPassable, config.tileSize, options.maxNodes);
};
