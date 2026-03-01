import {
    advancePointByTankHeading32,
    type CollisionWorld
} from "@battlecity/sim-core";
import type { ClientState } from "../app/state.js";
import { collectBlockingRects } from "./collision/collision-helpers.js";
import {
    movePlayerWithCollision,
    resolveStuckPlayerPosition
} from "./collision/collision-player.js";
import { logMovementDiag } from "../app/movement-diagnostics.js";

const MAP_MAX = 24576;
const PLAYER_RADIUS = 12;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;

const toCollisionPoint = (x: number, y: number): { x: number; y: number } => {
    return {
        x: x + PLAYER_SPRITE_HALF,
        y: y + PLAYER_SPRITE_HALF
    };
};

const fromCollisionPoint = (x: number, y: number): { x: number; y: number } => {
    return {
        x: x - PLAYER_SPRITE_HALF,
        y: y - PLAYER_SPRITE_HALF
    };
};

const clampTopLeftToWorld = (x: number, y: number): { x: number; y: number } => {
    const max = MAP_MAX - PLAYER_SPRITE_SIZE;
    return {
        x: Math.max(0, Math.min(max, x)),
        y: Math.max(0, Math.min(max, y))
    };
};

const buildCollisionWorld = (state: ClientState): CollisionWorld => {
    return {
        maxX: MAP_MAX,
        maxY: MAP_MAX,
        blocks: collectBlockingRects(state)
    };
};

export const moveLocalPlayer = (state: ClientState, direction: number, throttle: number, dtMs: number): void => {
    const world = buildCollisionWorld(state);
    const currentCenter = toCollisionPoint(state.local.x, state.local.y);
    const currentSafeCenter = resolveStuckPlayerPosition(world, currentCenter, PLAYER_RADIUS);
    const movementThrottle = Math.max(-1, Math.min(1, Number.isFinite(throttle) ? throttle : 0));
    const desiredCenter = advancePointByTankHeading32(
        currentSafeCenter.x,
        currentSafeCenter.y,
        direction,
        state.local.speed * movementThrottle,
        dtMs
    );
    const nextCenter = movePlayerWithCollision(world, currentSafeCenter, desiredCenter, PLAYER_RADIUS);
    const desiredDx = desiredCenter.x - currentSafeCenter.x;
    const desiredDy = desiredCenter.y - currentSafeCenter.y;
    const appliedDx = nextCenter.x - currentSafeCenter.x;
    const appliedDy = nextCenter.y - currentSafeCenter.y;
    const desiredDistance = Math.sqrt((desiredDx * desiredDx) + (desiredDy * desiredDy));
    const appliedDistance = Math.sqrt((appliedDx * appliedDx) + (appliedDy * appliedDy));
    if (movementThrottle !== 0 && desiredDistance > 0.01 && (appliedDistance + 0.01) < (desiredDistance * 0.6)) {
        logMovementDiag("collision.clamp", {
            playerId: state.local.id,
            throttle: movementThrottle,
            dtMs: Number(dtMs.toFixed(2)),
            direction: Number(direction.toFixed(3)),
            desiredDistance: Number(desiredDistance.toFixed(3)),
            appliedDistance: Number(appliedDistance.toFixed(3)),
            center: {
                x: Number(currentSafeCenter.x.toFixed(2)),
                y: Number(currentSafeCenter.y.toFixed(2))
            }
        });
    }
    const nextTopLeft = fromCollisionPoint(nextCenter.x, nextCenter.y);
    const clampedTopLeft = clampTopLeftToWorld(nextTopLeft.x, nextTopLeft.y);
    state.local.x = clampedTopLeft.x;
    state.local.y = clampedTopLeft.y;
};
