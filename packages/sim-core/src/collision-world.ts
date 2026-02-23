import { clamp } from "./geometry.js";

export type BlockingRect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

export type CollisionWorld = {
    maxX: number;
    maxY: number;
    blocks: ReadonlyArray<BlockingRect>;
};

export type CollisionPoint = {
    x: number;
    y: number;
};

const circleIntersectsRect = (point: CollisionPoint, radius: number, rect: BlockingRect): boolean => {
    const closestX = clamp(point.x, rect.x, rect.x + rect.width);
    const closestY = clamp(point.y, rect.y, rect.y + rect.height);
    const dx = point.x - closestX;
    const dy = point.y - closestY;
    return (dx * dx) + (dy * dy) <= radius * radius;
};

export const collidesAt = (
    world: CollisionWorld,
    point: CollisionPoint,
    radius: number
): boolean => {
    if ((point.x - radius) < 0 || (point.y - radius) < 0 || (point.x + radius) > world.maxX || (point.y + radius) > world.maxY) {
        return true;
    }
    for (const block of world.blocks) {
        if (circleIntersectsRect(point, radius, block)) {
            return true;
        }
    }
    return false;
};

export const clampToWorld = (world: CollisionWorld, point: CollisionPoint, radius: number): CollisionPoint => {
    return {
        x: clamp(point.x, radius, world.maxX - radius),
        y: clamp(point.y, radius, world.maxY - radius)
    };
};

export const tileToRect = (tileX: number, tileY: number, tileSize: number): BlockingRect => {
    return {
        x: tileX * tileSize,
        y: tileY * tileSize,
        width: tileSize,
        height: tileSize
    };
};

export const findNearestSafePoint = (
    world: CollisionWorld,
    origin: CollisionPoint,
    radius: number,
    searchStep: number,
    maxSearchDistance: number
): CollisionPoint | null => {
    const clampedOrigin = clampToWorld(world, origin, radius);
    if (!collidesAt(world, clampedOrigin, radius)) {
        return clampedOrigin;
    }

    for (let distance = searchStep; distance <= maxSearchDistance; distance += searchStep) {
        for (let dx = -distance; dx <= distance; dx += searchStep) {
            for (let dy = -distance; dy <= distance; dy += searchStep) {
                if (Math.abs(dx) !== distance && Math.abs(dy) !== distance) {
                    continue;
                }
                const candidate = clampToWorld(world, {
                    x: clampedOrigin.x + dx,
                    y: clampedOrigin.y + dy
                }, radius);
                if (!collidesAt(world, candidate, radius)) {
                    return candidate;
                }
            }
        }
    }

    return null;
};
