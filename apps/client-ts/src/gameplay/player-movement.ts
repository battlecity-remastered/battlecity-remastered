import {
    advancePointByHeading32,
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

const buildCollisionWorld = (state: ClientState): CollisionWorld => {
    return {
        maxX: MAP_MAX,
        maxY: MAP_MAX,
        blocks: collectBlockingRects(state)
    };
};

export const moveLocalPlayer = (state: ClientState, direction: number, dtMs: number): void => {
    const world = buildCollisionWorld(state);
    const current = resolveStuckPlayerPosition(world, { x: state.local.x, y: state.local.y }, PLAYER_RADIUS);
    const desired = advancePointByHeading32(current.x, current.y, direction, state.local.speed, dtMs);
    const next = movePlayerWithCollision(world, current, desired, PLAYER_RADIUS);
    state.local.x = next.x;
    state.local.y = next.y;
};
