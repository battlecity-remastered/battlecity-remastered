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
const BUILDING_FOOTPRINT_TILES = 3;
const REDUCED_BLOCKING_HEIGHT_TILES = 2;

const resolveBlockingHeightTiles = (buildingType: number): number => {
    const family = Math.max(0, Math.floor(buildingType / 100));
    return family <= 2 ? REDUCED_BLOCKING_HEIGHT_TILES : BUILDING_FOOTPRINT_TILES;
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

const nearestPassableTile = (
    blocked: Set<string>,
    origin: TilePoint,
    maxTile: number,
    maxRadius: number
): TilePoint | null => {
    if (inBounds(origin.x, origin.y, maxTile) && !blocked.has(tileKey(origin.x, origin.y))) {
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
            if (inBounds(top.x, top.y, maxTile) && !blocked.has(tileKey(top.x, top.y))) {
                return top;
            }
            if (inBounds(bottom.x, bottom.y, maxTile) && !blocked.has(tileKey(bottom.x, bottom.y))) {
                return bottom;
            }
        }

        for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
            const left = { x: minX, y: tileY };
            const right = { x: maxX, y: tileY };
            if (inBounds(left.x, left.y, maxTile) && !blocked.has(tileKey(left.x, left.y))) {
                return left;
            }
            if (inBounds(right.x, right.y, maxTile) && !blocked.has(tileKey(right.x, right.y))) {
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
    const start = nearestPassableTile(blocked, startTile, maxTile, 6);
    const goal = nearestPassableTile(blocked, goalTile, maxTile, 8);
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
            if (blocked.has(nextKey) || closed.has(nextKey)) {
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
