// Lightweight A* pathfinding for defender bots
import { ITEM_TYPE_TURRET, ITEM_TYPE_PLASMA, ITEM_TYPE_WALL } from "../constants.js";
import { NavMask } from "../bots/navmask.js";
const TILE_SIZE = 48;

class SimplePathfinder {
    constructor(game) {
        this.game = game;
        this.navMask = new NavMask(game);
        this.mask = this.navMask.getMask();
    }

    /**
     * Find a path from start to goal using A*
     * Returns array of waypoints [{x, y}] or null if no path found
     */
    findPath(startX, startY, goalX, goalY, maxNodes = 1500) {
        // focus the navmask around the goal to avoid scanning the whole map
        this.mask = this.navMask.getMask(2000, this.getMaskOptions(goalX, goalY));
        const mask = this.mask;

        let startTileX = Math.floor(startX / TILE_SIZE);
        let startTileY = Math.floor(startY / TILE_SIZE);
        let goalTileX = Math.floor(goalX / TILE_SIZE);
        let goalTileY = Math.floor(goalY / TILE_SIZE);

        const startPassable = this.findNearestPassable(startTileX, startTileY);
        if (!startPassable) {
            return null;
        }
        startTileX = startPassable.x;
        startTileY = startPassable.y;

        const goalPassable = this.findNearestPassable(goalTileX, goalTileY);
        if (!goalPassable) {
            return null;
        }
        goalTileX = goalPassable.x;
        goalTileY = goalPassable.y;

        // Quick check if goal is blocked
        if (this.isBlockedTile(goalTileX, goalTileY)) {
            // console.log(`[Pathfinder] Goal is blocked: (${goalTileX},${goalTileY})`);
            return null;
        }

        const openSet = [
            {
                x: startTileX,
                y: startTileY,
                g: 0,
                h: this.heuristic(startTileX, startTileY, goalTileX, goalTileY),
                f: 0,
                parent: null
            }
        ];
        const closedSet = new Set();
        const openHash = new Map();
        openHash.set(`${startTileX},${startTileY}`, openSet[0]);

        let iterations = 0;

        while (openSet.length > 0 && iterations < maxNodes) {
            iterations++;

            // Find node with lowest f score
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();
            const currentKey = `${current.x},${current.y}`;
            openHash.delete(currentKey);
            closedSet.add(currentKey);

            // Reached goal?
            if (current.x === goalTileX && current.y === goalTileY) {
                return this.reconstructPath(current);
            }

            // Check neighbors (4-way + diagonals that don't cut corners)
            const neighbors = [
                { x: current.x + 1, y: current.y, diag: false },     // right
                { x: current.x - 1, y: current.y, diag: false },     // left
                { x: current.x, y: current.y + 1, diag: false },     // down
                { x: current.x, y: current.y - 1, diag: false },     // up
                { x: current.x + 1, y: current.y + 1, diag: true }, // down-right
                { x: current.x - 1, y: current.y + 1, diag: true }, // down-left
                { x: current.x + 1, y: current.y - 1, diag: true }, // up-right
                { x: current.x - 1, y: current.y - 1, diag: true }  // up-left
            ];

            for (const neighbor of neighbors) {
                const neighborKey = `${neighbor.x},${neighbor.y}`;

                if (closedSet.has(neighborKey)) {
                    continue;
                }

                // Prevent corner cutting: diagonals only if both orthogonal tiles are passable
                if (neighbor.diag) {
                    const ortho1 = { x: neighbor.x, y: current.y };
                    const ortho2 = { x: current.x, y: neighbor.y };
                    if (this.isBlockedTile(ortho1.x, ortho1.y) || this.isBlockedTile(ortho2.x, ortho2.y)) {
                        continue;
                    }
                }

                if (this.isBlockedTile(neighbor.x, neighbor.y)) {
                    continue;
                }

                // Diagonal cost is higher
                const isDiagonal = neighbor.diag;
                const moveCost = isDiagonal ? 1.4 : 1;
                const tentativeG = current.g + moveCost;

                const existingNode = openHash.get(neighborKey);
                if (existingNode && tentativeG >= existingNode.g) {
                    continue; // Not a better path
                }

                const h = this.heuristic(neighbor.x, neighbor.y, goalTileX, goalTileY);
                const newNode = {
                    x: neighbor.x,
                    y: neighbor.y,
                    g: tentativeG,
                    h: h,
                    f: tentativeG + h,
                    parent: current
                };

                if (existingNode) {
                    // Update existing node
                    Object.assign(existingNode, newNode);
                } else {
                    // Add new node
                    openSet.push(newNode);
                    openHash.set(neighborKey, newNode);
                }
            }
        }

        // No path found
        if (iterations >= maxNodes) {
            console.warn(`[Pathfinder] Hit node limit of ${maxNodes} searching from (${startTileX},${startTileY}) to (${goalTileX},${goalTileY})`);
        }
        return null;
    }

    reconstructPath(node) {
        const path = [];
        let current = node;

        while (current) {
            path.unshift({
                x: current.x * TILE_SIZE + (TILE_SIZE / 2),
                y: current.y * TILE_SIZE + (TILE_SIZE / 2)
            });
            current = current.parent;
        }

        return path;
    }

    hasLineOfSight(from, to) {
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const steps = Math.ceil(distance / TILE_SIZE);

        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const x = from.x + dx * t;
            const y = from.y + dy * t;
            const tileX = Math.floor(x / TILE_SIZE);
            const tileY = Math.floor(y / TILE_SIZE);

            if (this.isBlockedTile(tileX, tileY)) {
                return false;
            }
        }

        return true;
    }

    heuristic(x1, y1, x2, y2) {
        // Euclidean distance
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    findNearestPassable(tileX, tileY, maxRadius = 20) {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return null;
        }
        if (!this.isBlockedTile(tileX, tileY)) {
            return { x: tileX, y: tileY };
        }
        for (let radius = 1; radius <= maxRadius; radius += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                for (let dy = -radius; dy <= radius; dy += 1) {
                    const nx = tileX + dx;
                    const ny = tileY + dy;
                    if (Math.abs(dx) !== radius && Math.abs(dy) !== radius) {
                        continue;
                    }
                    if (!this.isBlockedTile(nx, ny)) {
                        return { x: nx, y: ny };
                    }
                }
            }
        }
        return null;
    }

    refreshItemBlockers() {
        this.blockedItemTiles.clear();
        let node = this.game.itemFactory?.getHead?.();
        while (node) {
            const type = Number(node.type);
            const isDefense = node.isDefense === true;
            const isBlockingType = type === ITEM_TYPE_TURRET
                || type === ITEM_TYPE_PLASMA
                || type === ITEM_TYPE_WALL;
            if (isDefense || isBlockingType) {
                const tileX = Math.floor(node.x / TILE_SIZE);
                const tileY = Math.floor(node.y / TILE_SIZE);
                const key = `${tileX},${tileY}`;
                this.blockedItemTiles.add(key);
            }
            node = node.next;
        }
    }

    isBlockedTile(tileX, tileY) {
        if (!this.mask) {
            this.mask = this.navMask.getMask();
        }
        return this.mask.isBlockedTile(tileX, tileY);
    }

    getMaskOptions(goalX, goalY, radiusTiles = 40) {
        return {
            centerX: goalX,
            centerY: goalY,
            radiusTiles
        };
    }
}

export default SimplePathfinder;
