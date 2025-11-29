"use strict";

const TILE_SIZE = 48;
const PASSABLE_VALUES = new Set([0, 3]);
const BUILDING_WIDTH_TILES = 3;
const BUILDING_HEIGHT_TILES = 3;

const toFiniteNumber = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

class NavMask {
    constructor(game) {
        this.game = game;
        this.cache = null;
        this.expiresAt = 0;
        this.lastBounds = null;
    }

    getMask(ttlMs = 500, options = {}) {
        const now = this.game?.tick || Date.now();
        const bounds = this.computeBounds(options);
        const boundsChanged = !this.lastBounds
            || bounds.left !== this.lastBounds.left
            || bounds.right !== this.lastBounds.right
            || bounds.top !== this.lastBounds.top
            || bounds.bottom !== this.lastBounds.bottom;
        if (!this.cache || now >= this.expiresAt || boundsChanged) {
            this.cache = this.buildMask(bounds);
            this.expiresAt = now + ttlMs;
            this.lastBounds = bounds;
        }
        return this.cache;
    }

    computeBounds(options) {
        const map = this.game?.map;
        const width = Array.isArray(map) ? map.length : 0;
        const height = width > 0 && Array.isArray(map[0]) ? map[0].length : 0;
        const maxX = Math.max(0, width - 1);
        const maxY = Math.max(0, height - 1);
        const radiusTiles = Number.isFinite(options.radiusTiles) ? options.radiusTiles : 60;
        const centerX = Number.isFinite(options.centerX) ? options.centerX : (maxX * TILE_SIZE) / 2;
        const centerY = Number.isFinite(options.centerY) ? options.centerY : (maxY * TILE_SIZE) / 2;
        const radiusPx = radiusTiles * TILE_SIZE;
        const leftPx = Math.max(0, Math.floor((centerX - radiusPx) / TILE_SIZE));
        const rightPx = Math.min(maxX, Math.ceil((centerX + radiusPx) / TILE_SIZE));
        const topPx = Math.max(0, Math.floor((centerY - radiusPx) / TILE_SIZE));
        const bottomPx = Math.min(maxY, Math.ceil((centerY + radiusPx) / TILE_SIZE));
        return {
            left: leftPx,
            right: rightPx,
            top: topPx,
            bottom: bottomPx,
            width,
            height
        };
    }

    buildMask(bounds) {
        const width = (bounds.right - bounds.left) + 1;
        const height = (bounds.bottom - bounds.top) + 1;
        const grid = new Uint8Array(width * height);

        const indexOf = (tileX, tileY) => ((tileY - bounds.top) * width) + (tileX - bounds.left);
        const markBlocked = (tileX, tileY) => {
            if (tileX < bounds.left || tileX > bounds.right || tileY < bounds.top || tileY > bounds.bottom) {
                return;
            }
            const idx = indexOf(tileX, tileY);
            if (idx >= 0 && idx < grid.length) {
                grid[idx] = 1;
            }
        };

        const map = this.game?.map;
        if (Array.isArray(map) && map.length) {
            for (let x = bounds.left; x <= bounds.right; x += 1) {
                const col = map[x];
                if (!Array.isArray(col)) {
                    continue;
                }
                for (let y = bounds.top; y <= bounds.bottom; y += 1) {
                    const val = col[y];
                    if (!PASSABLE_VALUES.has(val)) {
                        markBlocked(x, y);
                    }
                }
            }
        }

        const buildings = this.game?.buildingFactory?.buildings;
        if (buildings && typeof buildings.values === 'function') {
            for (const building of buildings.values()) {
                const baseX = toFiniteNumber(building?.x, 0);
                const baseY = toFiniteNumber(building?.y, 0);
                for (let dx = -1; dx < BUILDING_WIDTH_TILES + 1; dx += 1) {
                    for (let dy = -1; dy < BUILDING_HEIGHT_TILES + 1; dy += 1) {
                        markBlocked(baseX + dx, baseY + dy);
                    }
                }
            }
        }

        const isBlockedTile = (tileX, tileY) => {
            if (tileX < bounds.left || tileX > bounds.right || tileY < bounds.top || tileY > bounds.bottom) {
                return true;
            }
            const idx = indexOf(tileX, tileY);
            return idx < 0 || idx >= grid.length ? true : grid[idx] === 1;
        };
        const isPassableTile = (tileX, tileY) => !isBlockedTile(tileX, tileY);
        const isBlocked = (x, y) => {
            const tileX = Math.floor(x / TILE_SIZE);
            const tileY = Math.floor(y / TILE_SIZE);
            return isBlockedTile(tileX, tileY);
        };

        const maskBounds = { ...bounds, width, height };

        return {
            isBlocked,
            isBlockedTile,
            isPassableTile,
            grid,
            width,
            height,
            bounds: maskBounds
        };
    }
}

module.exports = { NavMask };

