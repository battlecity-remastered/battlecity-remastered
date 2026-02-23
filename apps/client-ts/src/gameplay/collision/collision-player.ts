import {
    clampToWorld,
    collidesAt,
    findNearestSafePoint,
    type CollisionPoint,
    type CollisionWorld
} from "@battlecity/sim-core";

export const movePlayerWithCollision = (
    world: CollisionWorld,
    current: CollisionPoint,
    desired: CollisionPoint,
    radius: number
): CollisionPoint => {
    const clampedDesired = clampToWorld(world, desired, radius);
    if (!collidesAt(world, clampedDesired, radius)) {
        return clampedDesired;
    }

    const slideX = clampToWorld(world, { x: clampedDesired.x, y: current.y }, radius);
    if (!collidesAt(world, slideX, radius)) {
        return slideX;
    }

    const slideY = clampToWorld(world, { x: current.x, y: clampedDesired.y }, radius);
    if (!collidesAt(world, slideY, radius)) {
        return slideY;
    }

    return clampToWorld(world, current, radius);
};

export const resolveStuckPlayerPosition = (
    world: CollisionWorld,
    current: CollisionPoint,
    radius: number
): CollisionPoint => {
    if (!collidesAt(world, current, radius)) {
        return current;
    }
    const nearest = findNearestSafePoint(world, current, radius, 8, 192);
    return nearest ?? current;
};
