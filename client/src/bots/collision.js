// Shared collision helpers for bot movement
import { rectangleCollision } from '../collision/collision-helpers.js';
import { ITEM_TYPE_MINE, ITEM_TYPE_DFG } from '../constants.js';

const TILE_SIZE = 48;
const SPRITE_GAP = 8;

export const createBlockingChecker = (game, getEntityContext = null) => {
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

    const hitsItem = (rect, entity) => {
        const context = (typeof getEntityContext === 'function') ? getEntityContext(entity) : null;
        const entityTeam = Number.isFinite(context?.teamId) ? Math.floor(context.teamId) : null;
        const entityOwner = context?.ownerId ?? null;

        let node = game.itemFactory?.getHead?.();
        while (node) {
            const itemRect = {
                x: node.x,
                y: node.y,
                w: TILE_SIZE,
                h: TILE_SIZE
            };
            if (rectangleCollision(rect, itemRect)) {
                const itemTeam = Number.isFinite(node.teamId ?? node.city) ? Math.floor(node.teamId ?? node.city) : null;
                const isFriendly = (entityTeam !== null && itemTeam !== null && entityTeam === itemTeam)
                    || (!!entityOwner && node.ownerId && node.ownerId === entityOwner)
                    || (!!entityOwner && node.owner && node.owner === entityOwner);

                // Friendly mines/DFGs should not block bots from their own team.
                if (isFriendly && (node.type === ITEM_TYPE_MINE || node.type === ITEM_TYPE_DFG)) {
                    node = node.next;
                    continue;
                }
                return true;
            }
            node = node.next;
        }
        return false;
    };

    const isBlocked = (x, y, entity = null) => {
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
        if (hitsItem(rect, entity)) {
            return true;
        }
        return false;
    };

    return { isBlocked };
};
