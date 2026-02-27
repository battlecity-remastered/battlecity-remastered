import { BinaryMinHeap } from "./bot-path-heap.js";

export type TilePoint = {
    x: number;
    y: number;
};

export type PathBounds = {
    minTileX: number;
    maxTileX: number;
    minTileY: number;
    maxTileY: number;
};

type Node = {
    x: number;
    y: number;
    key: string;
    g: number;
    f: number;
    parent?: string;
};

type NeighborStep = {
    dx: number;
    dy: number;
    step: number;
};

const tileKey = (x: number, y: number): string => `${x},${y}`;
const PATH_NEIGHBORS: ReadonlyArray<NeighborStep> = [
    { dx: 1, dy: 0, step: 10 },
    { dx: -1, dy: 0, step: 10 },
    { dx: 0, dy: 1, step: 10 },
    { dx: 0, dy: -1, step: 10 },
    { dx: 1, dy: 1, step: 14 },
    { dx: 1, dy: -1, step: 14 },
    { dx: -1, dy: 1, step: 14 },
    { dx: -1, dy: -1, step: 14 }
];

const octileHeuristic = (ax: number, ay: number, bx: number, by: number): number => {
    const dx = Math.abs(ax - bx);
    const dy = Math.abs(ay - by);
    const min = Math.min(dx, dy);
    const max = Math.max(dx, dy);
    return (min * 14) + ((max - min) * 10);
};

const isWithinBounds = (tileX: number, tileY: number, bounds: PathBounds): boolean => {
    return tileX >= bounds.minTileX
        && tileX <= bounds.maxTileX
        && tileY >= bounds.minTileY
        && tileY <= bounds.maxTileY;
};

const reconstructPath = (
    terminalNode: Node,
    allNodes: Map<string, Node>,
    tileSize: number
): Array<{ x: number; y: number }> => {
    const path: Array<{ x: number; y: number }> = [];
    let cursor: Node | undefined = terminalNode;
    while (cursor) {
        path.push({
            x: cursor.x * tileSize,
            y: cursor.y * tileSize
        });
        cursor = cursor.parent ? allNodes.get(cursor.parent) : undefined;
    }
    path.reverse();
    return path;
};

const isDiagonalCornerCut = (
    current: Node,
    neighbor: NeighborStep,
    isPassable: (tileX: number, tileY: number) => boolean
): boolean => {
    if (neighbor.dx === 0 || neighbor.dy === 0) {
        return false;
    }
    return !isPassable(current.x + neighbor.dx, current.y)
        || !isPassable(current.x, current.y + neighbor.dy);
};

const updateOrInsertNeighbor = (
    current: Node,
    neighbor: NeighborStep,
    goal: TilePoint,
    open: BinaryMinHeap<Node>,
    openByKey: Map<string, Node>,
    allNodes: Map<string, Node>
): void => {
    const nextX = current.x + neighbor.dx;
    const nextY = current.y + neighbor.dy;
    const nextKey = tileKey(nextX, nextY);
    const tentativeG = current.g + neighbor.step;
    const existing = openByKey.get(nextKey);

    if (existing && tentativeG >= existing.g) {
        return;
    }
    if (existing) {
        existing.g = tentativeG;
        existing.f = tentativeG + octileHeuristic(nextX, nextY, goal.x, goal.y);
        existing.parent = current.key;
        open.update(existing);
        return;
    }

    const nextNode: Node = {
        x: nextX,
        y: nextY,
        key: nextKey,
        g: tentativeG,
        f: tentativeG + octileHeuristic(nextX, nextY, goal.x, goal.y),
        parent: current.key
    };
    open.push(nextNode);
    openByKey.set(nextKey, nextNode);
    allNodes.set(nextKey, nextNode);
};

const expandCurrentNode = (
    current: Node,
    bounds: PathBounds,
    closed: Set<string>,
    goal: TilePoint,
    isPassable: (tileX: number, tileY: number) => boolean,
    open: BinaryMinHeap<Node>,
    openByKey: Map<string, Node>,
    allNodes: Map<string, Node>
): void => {
    for (const neighbor of PATH_NEIGHBORS) {
        const nextX = current.x + neighbor.dx;
        const nextY = current.y + neighbor.dy;
        if (!isWithinBounds(nextX, nextY, bounds)) {
            continue;
        }
        const nextKey = tileKey(nextX, nextY);
        if (closed.has(nextKey)) {
            continue;
        }
        if (!isPassable(nextX, nextY)) {
            continue;
        }
        if (isDiagonalCornerCut(current, neighbor, isPassable)) {
            continue;
        }
        updateOrInsertNeighbor(current, neighbor, goal, open, openByKey, allNodes);
    }
};

export const resolvePathBounds = (
    startTile: TilePoint,
    goalTile: TilePoint,
    maxTile: number,
    searchRadiusTiles: number
): PathBounds => {
    return {
        minTileX: Math.max(0, Math.min(startTile.x, goalTile.x) - searchRadiusTiles),
        maxTileX: Math.min(maxTile, Math.max(startTile.x, goalTile.x) + searchRadiusTiles),
        minTileY: Math.max(0, Math.min(startTile.y, goalTile.y) - searchRadiusTiles),
        maxTileY: Math.min(maxTile, Math.max(startTile.y, goalTile.y) + searchRadiusTiles)
    };
};

export const nearestPassableTile = (
    origin: TilePoint,
    maxRadius: number,
    isPassable: (tileX: number, tileY: number) => boolean
): TilePoint | null => {
    if (isPassable(origin.x, origin.y)) {
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
            if (isPassable(top.x, top.y)) {
                return top;
            }
            if (isPassable(bottom.x, bottom.y)) {
                return bottom;
            }
        }

        for (let tileY = minY + 1; tileY < maxY; tileY += 1) {
            const left = { x: minX, y: tileY };
            const right = { x: maxX, y: tileY };
            if (isPassable(left.x, left.y)) {
                return left;
            }
            if (isPassable(right.x, right.y)) {
                return right;
            }
        }
    }

    return null;
};

export const runAStar = (
    start: TilePoint,
    goal: TilePoint,
    bounds: PathBounds,
    isPassable: (tileX: number, tileY: number) => boolean,
    tileSize: number,
    maxNodes: number
): Array<{ x: number; y: number }> | null => {
    const startKey = tileKey(start.x, start.y);
    const goalKey = tileKey(goal.x, goal.y);
    if (startKey === goalKey) {
        return [{ x: goal.x * tileSize, y: goal.y * tileSize }];
    }

    const open = new BinaryMinHeap<Node>((left, right) => {
        if (left.f !== right.f) {
            return left.f - right.f;
        }
        return right.g - left.g;
    });
    const openByKey = new Map<string, Node>();
    const closed = new Set<string>();
    const allNodes = new Map<string, Node>();

    const startNode: Node = {
        x: start.x,
        y: start.y,
        key: startKey,
        g: 0,
        f: octileHeuristic(start.x, start.y, goal.x, goal.y)
    };
    open.push(startNode);
    openByKey.set(startKey, startNode);
    allNodes.set(startKey, startNode);

    let explored = 0;
    while (open.size > 0 && explored < maxNodes) {
        explored += 1;
        const current = open.pop();
        if (!current) {
            break;
        }
        openByKey.delete(current.key);
        closed.add(current.key);
        if (current.key === goalKey) {
            return reconstructPath(current, allNodes, tileSize);
        }

        expandCurrentNode(current, bounds, closed, goal, isPassable, open, openByKey, allNodes);
    }
    return null;
};
