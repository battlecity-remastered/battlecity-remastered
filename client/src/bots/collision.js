// Shared collision helpers for bot movement
import { rectangleCollision } from '../collision/collision-helpers.js';

const TILE_SIZE = 48;
const SPRITE_GAP = 8;

export const createBlockingChecker = (game) => {
    const hitsEdges = (rect) => {
        if (rect.x < 0 || rect.y < 0) {
            return true;
        }
        if ((rect.x + rect.w) > (512 * TILE_SIZE) || (rect.y + rect.h) > (512 * TILE_SIZE)) {
            return true;
        }
        return false;
    };

    const hitsBlockingTile = (rect) => {
        const map = game.map;
        if (!Array.isArray(map) || !map.length) {
            return false;
        }

        const left = Math.floor(rect.x / TILE_SIZE);
        const right = Math.floor((rect.x + rect.w) / TILE_SIZE);
        const top = Math.floor(rect.y / TILE_SIZE);
        const bottom = Math.floor((rect.y + rect.h) / TILE_SIZE);

        const isBlocked = (x, y) => {
            try {
                return map[x][y] !== 0 && map[x][y] !== 3;
            } catch (_error) {
                return true;
            }
        };

        return isBlocked(left, top) || isBlocked(left, bottom) || isBlocked(right, top) || isBlocked(right, bottom);
    };

    const hitsBuilding = (rect) => {
        let node = game.buildingFactory?.getHead?.();
        while (node) {
            const buildingRect = {
                x: node.x * TILE_SIZE,
                y: node.y * TILE_SIZE,
                w: TILE_SIZE * 3,
                h: TILE_SIZE * 3
            };
            if (rectangleCollision(rect, buildingRect)) {
                return true;
            }
            node = node.next;
        }
        return false;
    };

    const hitsItem = (rect) => {
        let node = game.itemFactory?.getHead?.();
        while (node) {
            const itemRect = {
                x: node.x,
                y: node.y,
                w: TILE_SIZE,
                h: TILE_SIZE
            };
            if (rectangleCollision(rect, itemRect)) {
                return true;
            }
            node = node.next;
        }
        return false;
    };

    const isBlocked = (x, y) => {
        const rect = {
            x: x + SPRITE_GAP,
            y: y + SPRITE_GAP,
            w: TILE_SIZE - (SPRITE_GAP * 2),
            h: TILE_SIZE - (SPRITE_GAP * 2)
        };

        if (hitsEdges(rect)) {
            return true;
        }
        if (hitsBlockingTile(rect)) {
            return true;
        }
        if (hitsBuilding(rect)) {
            return true;
        }
        if (hitsItem(rect)) {
            return true;
        }
        return false;
    };

    return { isBlocked };
};
