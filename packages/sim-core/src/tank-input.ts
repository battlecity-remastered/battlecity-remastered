import { advancePointByTankHeading32, normalizeHeading32 } from "./motion.js";
import { clampToWorld, collidesAt, findNearestSafePoint, type CollisionPoint, type CollisionWorld } from "./collision-world.js";

export type TankMovementInput = { seq: number; dtMs: number; turn: number; throttle: number };
export type TankMovementPose = { x: number; y: number; direction: number };
export const TANK_TURN_SPEED = 12;
const HALF = 24, RADIUS = 12;

const slide = (world: CollisionWorld, current: CollisionPoint, desired: CollisionPoint): CollisionPoint => {
    const next = clampToWorld(world, desired, RADIUS);
    if (!collidesAt(world, next, RADIUS)) return next;
    const x = { x: next.x, y: current.y };
    if (!collidesAt(world, x, RADIUS)) return x;
    const y = { x: current.x, y: next.y };
    return !collidesAt(world, y, RADIUS) ? y : current;
};

// Prediction and authority must run identical small steps, including while
// turning or sliding along a wall. Packet arrival time is never a physics clock.
export const stepTankInput = (pose: TankMovementPose, input: TankMovementInput, speed: number, world: CollisionWorld, frozen = false): TankMovementPose => {
    let point = { x: pose.x + HALF, y: pose.y + HALF };
    if (collidesAt(world, point, RADIUS)) point = findNearestSafePoint(world, point, RADIUS, 8, 192) ?? point;
    let direction = pose.direction;
    const elapsed = Math.max(0, Math.min(100, input.dtMs));
    const steps = Math.ceil(elapsed / Math.min(8, 12000 / Math.max(1, Math.abs(speed))));
    const dt = steps ? elapsed / steps : 0;
    for (let i = 0; i < steps; i++) {
        const turn = frozen ? 0 : input.turn * TANK_TURN_SPEED * dt / 1000;
        const midpoint = normalizeHeading32(direction + turn * .5);
        direction = normalizeHeading32(direction + turn);
        if (!frozen && input.throttle) point = slide(world, point, advancePointByTankHeading32(point.x, point.y, midpoint, speed * input.throttle, dt));
    }
    return { x: Math.max(0, Math.min(world.maxX - 48, point.x - HALF)), y: Math.max(0, Math.min(world.maxY - 48, point.y - HALF)), direction };
};
