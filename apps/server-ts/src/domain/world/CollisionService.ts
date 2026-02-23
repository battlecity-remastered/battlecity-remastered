import type { RuntimeState } from "../../runtime/types.js";

const TILE_SIZE = 32;
const PLAYER_RADIUS = 12;

const toBuildingBounds = (tileX: number, tileY: number) => {
    const left = tileX * TILE_SIZE;
    const top = tileY * TILE_SIZE;
    return {
        left,
        top,
        right: left + TILE_SIZE,
        bottom: top + TILE_SIZE
    };
};

const circleIntersectsRect = (
    x: number,
    y: number,
    radius: number,
    bounds: { left: number; top: number; right: number; bottom: number }
): boolean => {
    const nearestX = Math.max(bounds.left, Math.min(x, bounds.right));
    const nearestY = Math.max(bounds.top, Math.min(y, bounds.bottom));
    const dx = x - nearestX;
    const dy = y - nearestY;
    return (dx * dx) + (dy * dy) <= radius * radius;
};

export const collidesWithBuilding = (state: RuntimeState, cityId: number, x: number, y: number): boolean => {
    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId) {
            continue;
        }
        if (circleIntersectsRect(x, y, PLAYER_RADIUS, toBuildingBounds(building.tileX, building.tileY))) {
            return true;
        }
    }
    return false;
};

export const clampToWorld = (x: number, y: number, mapMax: number): { x: number; y: number } => {
    return {
        x: Math.max(0, Math.min(mapMax, x)),
        y: Math.max(0, Math.min(mapMax, y))
    };
};
