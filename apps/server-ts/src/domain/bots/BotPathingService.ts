import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

type TilePoint = {
    x: number;
    y: number;
};

type PathOptions = {
    searchRadiusTiles: number;
    maxNodes: number;
};

const BOT_HALF = 24;
const BOT_RADIUS = 18;
const BUILDING_FOOTPRINT_TILES = 3;

const resolveBlockingHeightTiles = (buildingType: number): number => {
    // Match player runtime collision profile exactly.
    const family = Math.max(0, Math.floor(buildingType / 100));
    return family <= 2 ? 2 : BUILDING_FOOTPRINT_TILES;
};

const tileKey = (x: number, y: number): string => `${x},${y}`;

const toTile = (value: number, tileSize: number): number => {
    return Math.floor(value / tileSize);
};

const toTopLeft = (tile: TilePoint, tileSize: number): TilePoint => {
    return {
        x: tile.x * tileSize,
        y: tile.y * tileSize
    };
};

const octileHeuristic = (ax: number, ay: number, bx: number, by: number): number => {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    const min = Math.min(dx, dy);
    const max = Math.max(dx, dy);
    return (min * 14) + ((max - min) * 10);
};

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

const nearestPassableTile = (
    blocked: Set<string>,
    origin: TilePoint,
    tileSize: number,
    maxTile: number,
    maxRadius: number
): TilePoint | null => {
    if (isTileBodyPassable(blocked, origin.x, origin.y, tileSize, maxTile)) {
        return origin;
    }

    for (let radius = 1; radius <= maxRadius; radius += 1) {
        const minX = origin.x - radius;
        const maxX = origin.x + radius;
        const minY = origin.y - radius;
        const maxY = origin.y + radius;

        for (let tileX = minX; tileX <= maxX; tileX += 1) {
            const top = { x: tileX, y: minY };
            const bottom = { x: tileX, y: maxY };
            if (isTileBodyPassable(blocked, top.x, top.y, tileSize, maxTile)) {
                return top;
            }
            if (isTileBodyPassable(blocked, bottom.x, bottom.y, tileSize, maxTile)) {
                return bottom;
            }
        }

        for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
            const left = { x: minX, y: tileY };
            const right = { x: maxX, y: tileY };
            if (isTileBodyPassable(blocked, left.x, left.y, tileSize, maxTile)) {
                return left;
            }
            if (isTileBodyPassable(blocked, right.x, right.y, tileSize, maxTile)) {
                return right;
            }
        }
    }

    return null;
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

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            if (state.blockingTiles.has(tileKey(tileX, tileY))) {
                blocked.add(tileKey(tileX, tileY));
            }
        }
    }

    for (const building of state.buildings.values()) {
        const minX = Math.max(minTileX, building.tileX);
        const maxX = Math.min(maxTileX, building.tileX + BUILDING_FOOTPRINT_TILES - 1);
        const heightTiles = resolveBlockingHeightTiles(building.type);
        const minY = Math.max(minTileY, building.tileY);
        const maxY = Math.min(maxTileY, building.tileY + heightTiles - 1);
        for (let tileX = minX; tileX <= maxX; tileX += 1) {
            for (let tileY = minY; tileY <= maxY; tileY += 1) {
                blocked.add(tileKey(tileX, tileY));
            }
        }
    }

    for (const defense of state.defenses.values()) {
        if (defense.tileX < minTileX || defense.tileX > maxTileX || defense.tileY < minTileY || defense.tileY > maxTileY) {
            continue;
        }
        blocked.add(tileKey(defense.tileX, defense.tileY));
    }

    // Avoid routing through active hazards when possible.
    for (const hazard of state.hazards.values()) {
        const tileX = toTile(hazard.x, config.tileSize);
        const tileY = toTile(hazard.y, config.tileSize);
        if (tileX < minTileX || tileX > maxTileX || tileY < minTileY || tileY > maxTileY) {
            continue;
        }
        blocked.add(tileKey(tileX, tileY));
    }

    return blocked;
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

    const startTile = {
        x: toTile(startTopLeftX + BOT_HALF, config.tileSize),
        y: toTile(startTopLeftY + BOT_HALF, config.tileSize)
    };
    const goalTile = {
        x: toTile(goalTopLeftX + BOT_HALF, config.tileSize),
        y: toTile(goalTopLeftY + BOT_HALF, config.tileSize)
    };

    const minTileX = Math.max(0, Math.min(startTile.x, goalTile.x) - options.searchRadiusTiles);
    const maxTileX = Math.min(maxTile, Math.max(startTile.x, goalTile.x) + options.searchRadiusTiles);
    const minTileY = Math.max(0, Math.min(startTile.y, goalTile.y) - options.searchRadiusTiles);
    const maxTileY = Math.min(maxTile, Math.max(startTile.y, goalTile.y) + options.searchRadiusTiles);

    const blocked = buildBlockedSet(state, config, minTileX, maxTileX, minTileY, maxTileY);
    const start = nearestPassableTile(blocked, startTile, config.tileSize, maxTile, 6);
    const goal = nearestPassableTile(blocked, goalTile, config.tileSize, maxTile, 8);
    if (!start || !goal) {
        return null;
    }

    const startKey = tileKey(start.x, start.y);
    const goalKey = tileKey(goal.x, goal.y);
    if (startKey === goalKey) {
        const point = toTopLeft(goal, config.tileSize);
        return [{ x: point.x, y: point.y }];
    }

    type Node = {
        x: number;
        y: number;
        key: string;
        g: number;
        f: number;
        parent?: string;
    };

    const open = new Map<string, Node>();
    const closed = new Set<string>();
    const allNodes = new Map<string, Node>();
    const startNode: Node = {
        x: start.x,
        y: start.y,
        key: startKey,
        g: 0,
        f: octileHeuristic(start.x, start.y, goal.x, goal.y)
    };
    open.set(startKey, startNode);
    allNodes.set(startKey, startNode);

    const neighbors: Array<{ dx: number; dy: number; step: number }> = [
        { dx: 1, dy: 0, step: 10 },
        { dx: -1, dy: 0, step: 10 },
        { dx: 0, dy: 1, step: 10 },
        { dx: 0, dy: -1, step: 10 },
        { dx: 1, dy: 1, step: 14 },
        { dx: 1, dy: -1, step: 14 },
        { dx: -1, dy: 1, step: 14 },
        { dx: -1, dy: -1, step: 14 }
    ];

    let explored = 0;
    while (open.size > 0 && explored < options.maxNodes) {
        explored += 1;

        let current: Node | undefined;
        for (const candidate of open.values()) {
            if (!current || candidate.f < current.f || (candidate.f === current.f && candidate.g > current.g)) {
                current = candidate;
            }
        }
        if (!current) {
            break;
        }

        open.delete(current.key);
        closed.add(current.key);
        if (current.key === goalKey) {
            const path: Array<{ x: number; y: number }> = [];
            let cursor: Node | undefined = current;
            while (cursor) {
                const point = toTopLeft({ x: cursor.x, y: cursor.y }, config.tileSize);
                path.push({ x: point.x, y: point.y });
                cursor = cursor.parent ? allNodes.get(cursor.parent) : undefined;
            }
            path.reverse();
            return path;
        }

        for (const neighbor of neighbors) {
            const nextX = current.x + neighbor.dx;
            const nextY = current.y + neighbor.dy;
            if (nextX < minTileX || nextX > maxTileX || nextY < minTileY || nextY > maxTileY) {
                continue;
            }
            const nextKey = tileKey(nextX, nextY);
            if (closed.has(nextKey)) {
                continue;
            }
            if (!isTileBodyPassable(blocked, nextX, nextY, config.tileSize, maxTile)) {
                continue;
            }

            // Prevent diagonal corner-cutting.
            if (neighbor.dx !== 0 && neighbor.dy !== 0) {
                const sideA = tileKey(current.x + neighbor.dx, current.y);
                const sideB = tileKey(current.x, current.y + neighbor.dy);
                if (blocked.has(sideA) || blocked.has(sideB)) {
                    continue;
                }
            }

            const tentativeG = current.g + neighbor.step;
            const existing = open.get(nextKey);
            if (existing && tentativeG >= existing.g) {
                continue;
            }
            const nextNode: Node = {
                x: nextX,
                y: nextY,
                key: nextKey,
                g: tentativeG,
                f: tentativeG + octileHeuristic(nextX, nextY, goal.x, goal.y),
                parent: current.key
            };
            open.set(nextKey, nextNode);
            allNodes.set(nextKey, nextNode);
        }
    }

    return null;
};
