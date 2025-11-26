/* eslint-env worker */
/* global self, WebAssembly */
const TILE_SIZE = 48;

class MinHeap {
    constructor(compare) {
        this.compare = compare;
        this.items = [];
    }

    get size() {
        return this.items.length;
    }

    push(node) {
        const idx = this.items.length;
        this.items.push(node);
        node._idx = idx;
        this.#bubbleUp(idx);
    }

    pop() {
        if (!this.items.length) return null;
        const min = this.items[0];
        const end = this.items.pop();
        min._idx = -1;
        if (this.items.length) {
            this.items[0] = end;
            this.items[0]._idx = 0;
            this.#bubbleDown(0);
        }
        return min;
    }

    update(node) {
        const idx = node._idx;
        if (idx == null || idx < 0 || idx >= this.items.length) return;
        this.#bubbleUp(idx);
        this.#bubbleDown(idx);
    }

    #bubbleUp(idx) {
        while (idx > 0) {
            const parent = (idx - 1) >> 1;
            if (this.compare(this.items[idx], this.items[parent]) >= 0) break;
            this.#swap(idx, parent);
            idx = parent;
        }
    }

    #bubbleDown(idx) {
        const length = this.items.length;
        while (true) {
            const left = (idx * 2) + 1;
            const right = left + 1;
            let smallest = idx;

            if (left < length && this.compare(this.items[left], this.items[smallest]) < 0) {
                smallest = left;
            }

            if (right < length && this.compare(this.items[right], this.items[smallest]) < 0) {
                smallest = right;
            }

            if (smallest === idx) break;
            this.#swap(idx, smallest);
            idx = smallest;
        }
    }

    #swap(a, b) {
        const tmp = this.items[a];
        this.items[a] = this.items[b];
        this.items[b] = tmp;
        this.items[a]._idx = a;
        this.items[b]._idx = b;
    }
}

let wasmExports = null;

const loadWasm = async () => {
    if (wasmExports) {
        return wasmExports;
    }
    const url = new URL('./wasm/astar.wasm', import.meta.url);
    const response = await fetch(url);
    const bytes = await response.arrayBuffer();
    const { instance } = await WebAssembly.instantiate(bytes);
    wasmExports = instance.exports;
    return wasmExports;
};

const isBlockedTile = (tileX, tileY, mask) => {
    if (tileX < mask.left || tileX > mask.right || tileY < mask.top || tileY > mask.bottom) {
        return true;
    }
    const idx = ((tileY - mask.top) * mask.width) + (tileX - mask.left);
    return mask.grid[idx] === 1;
};

const findNearestPassable = (tileX, tileY, mask, maxRadius = 20) => {
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return null;
    }
    if (!isBlockedTile(tileX, tileY, mask)) {
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
                if (!isBlockedTile(nx, ny, mask)) {
                    return { x: nx, y: ny };
                }
            }
        }
    }
    return null;
};

const reconstructPath = (node) => {
    const path = [];
    let current = node;

    while (current) {
        path.unshift({
            x: (current.x * TILE_SIZE) + (TILE_SIZE / 2),
            y: (current.y * TILE_SIZE) + (TILE_SIZE / 2)
        });
        current = current.parent;
    }

    return path;
};

const heuristic = (x1, y1, x2, y2) => {
    const dx = Math.abs(x2 - x1);
    const dy = Math.abs(y2 - y1);
    if (!wasmExports) {
        const min = Math.min(dx, dy);
        const max = Math.max(dx, dy);
        return (max - min) + (1.4 * min);
    }
    return wasmExports.octile(dx, dy);
};

const findPath = (payload) => {
    const { startX, startY, goalX, goalY, mask, maxNodes = 1500 } = payload;

    let startTileX = Math.floor(startX / TILE_SIZE);
    let startTileY = Math.floor(startY / TILE_SIZE);
    let goalTileX = Math.floor(goalX / TILE_SIZE);
    let goalTileY = Math.floor(goalY / TILE_SIZE);

    const startPassable = findNearestPassable(startTileX, startTileY, mask);
    if (!startPassable) {
        return null;
    }
    startTileX = startPassable.x;
    startTileY = startPassable.y;

    const goalPassable = findNearestPassable(goalTileX, goalTileY, mask);
    if (!goalPassable) {
        return null;
    }
    goalTileX = goalPassable.x;
    goalTileY = goalPassable.y;

    if (isBlockedTile(goalTileX, goalTileY, mask)) {
        return null;
    }

    const openSet = new MinHeap((a, b) => a.f - b.f);
    const startNode = {
        x: startTileX,
        y: startTileY,
        g: 0,
        h: heuristic(startTileX, startTileY, goalTileX, goalTileY),
        f: 0,
        parent: null
    };
    startNode.f = startNode.h;
    openSet.push(startNode);
    const closedSet = new Set();
    const openHash = new Map();
    openHash.set(`${startTileX},${startTileY}`, startNode);

    let iterations = 0;

    while (openSet.size > 0 && iterations < maxNodes) {
        iterations += 1;

        const current = openSet.pop();
        const currentKey = `${current.x},${current.y}`;
        openHash.delete(currentKey);
        closedSet.add(currentKey);

        if (current.x === goalTileX && current.y === goalTileY) {
            return reconstructPath(current);
        }

        const neighbors = [
            { x: current.x + 1, y: current.y, diag: false },
            { x: current.x - 1, y: current.y, diag: false },
            { x: current.x, y: current.y + 1, diag: false },
            { x: current.x, y: current.y - 1, diag: false },
            { x: current.x + 1, y: current.y + 1, diag: true },
            { x: current.x - 1, y: current.y + 1, diag: true },
            { x: current.x + 1, y: current.y - 1, diag: true },
            { x: current.x - 1, y: current.y - 1, diag: true }
        ];

        for (const neighbor of neighbors) {
            const neighborKey = `${neighbor.x},${neighbor.y}`;

            if (closedSet.has(neighborKey)) {
                continue;
            }

            if (neighbor.diag) {
                const ortho1 = { x: neighbor.x, y: current.y };
                const ortho2 = { x: current.x, y: neighbor.y };
                if (isBlockedTile(ortho1.x, ortho1.y, mask) || isBlockedTile(ortho2.x, ortho2.y, mask)) {
                    continue;
                }
            }

            if (isBlockedTile(neighbor.x, neighbor.y, mask)) {
                continue;
            }

            const moveCost = neighbor.diag ? 1.4 : 1;
            const tentativeG = current.g + moveCost;

            const existingNode = openHash.get(neighborKey);
            if (existingNode && tentativeG >= existingNode.g) {
                continue;
            }

            const h = heuristic(neighbor.x, neighbor.y, goalTileX, goalTileY);
            const newNode = {
                x: neighbor.x,
                y: neighbor.y,
                g: tentativeG,
                h,
                f: tentativeG + h,
                parent: current
            };

            if (existingNode) {
                Object.assign(existingNode, newNode);
                openSet.update(existingNode);
            } else {
                openSet.push(newNode);
                openHash.set(neighborKey, newNode);
            }
        }
    }

    return null;
};

self.onmessage = async (event) => {
    const { id, type, payload } = event.data || {};
    if (type === 'warmup') {
        try {
            await loadWasm();
            self.postMessage({ id, type: 'ready' });
        } catch (err) {
            self.postMessage({ id, type: 'error', error: err?.message || String(err) });
        }
        return;
    }

    if (type === 'path') {
        try {
            await loadWasm();
            const path = findPath(payload);
            self.postMessage({ id, type: 'path', path });
        } catch (err) {
            self.postMessage({ id, type: 'error', error: err?.message || String(err) });
        }
    }
};
