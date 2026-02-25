import {
    advancePointByLegacyHeading32,
    type CollisionWorld
} from "@battlecity/sim-core";
import type { ClientState } from "../app/state.js";
import { collectBlockingRects } from "./collision/collision-helpers.js";
import {
    movePlayerWithCollision,
    resolveStuckPlayerPosition
} from "./collision/collision-player.js";

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
    const desiredCenter = advancePointByLegacyHeading32(
        currentSafeCenter.x,
        currentSafeCenter.y,
        direction,
        state.local.speed * movementThrottle,
        dtMs
    );
    const nextCenter = movePlayerWithCollision(world, currentSafeCenter, desiredCenter, PLAYER_RADIUS);
    const nextTopLeft = fromCollisionPoint(nextCenter.x, nextCenter.y);
    const clampedTopLeft = clampTopLeftToWorld(nextTopLeft.x, nextTopLeft.y);
    state.local.x = clampedTopLeft.x;
    state.local.y = clampedTopLeft.y;
};
