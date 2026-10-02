import { MAX_PENDING_TANK_INPUT_MS, stepTankInput, type TankMovementInput } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimePlayer, RuntimeState } from "./types.js";
import { buildCollisionWorld } from "./collision-world.js";

// Credit follows server time, bounding the total simulation a client can claim.
// Keep enough credit for a delayed TCP burst, without banking idle time forever.
// A valid client can have this entire prediction window arrive in one burst.
// Retain additional headroom for packet timing and clock precision; clipping a
// legitimate frame also changes its turn and makes every replay disagree.
const MAX_TIME_CREDIT_MS = MAX_PENDING_TANK_INPUT_MS + 1000;
const refillMovementCredit = (player: RuntimePlayer, now: number): number => {
    const previousAt = player.lastMovementInputAt ?? player.lastAcceptedUpdateAt ?? now;
    return Math.min(MAX_TIME_CREDIT_MS, (player.movementTimeCreditMs ?? 250) + Math.max(0, now - previousAt));
};

export const applyPlayerInputFrames = (state: RuntimeState, player: RuntimePlayer, frames: readonly TankMovementInput[], config: RuntimeConfig): void => {
    const now = Date.now();
    let credit = refillMovementCredit(player, now);
    let pose = { x: player.x, y: player.y, direction: player.direction };
    let lastSeq = player.lastMovementInputSeq ?? 0;
    const frozen = (player.frozenUntil ?? 0) > now;
    for (const frame of frames) {
        if (frame.seq <= lastSeq) continue;
        const dtMs = Math.min(frame.dtMs, credit);
        player.movementClippedMs = (player.movementClippedMs ?? 0) + frame.dtMs - dtMs;
        const world = buildCollisionWorld(state, config, pose.x + 24, pose.y + 24);
        pose = stepTankInput(pose, { ...frame, dtMs }, config.playerSpeed, world, frozen);
        credit -= dtMs;
        lastSeq = frame.seq;
    }
    Object.assign(player, pose, { speed: config.playerSpeed, lastAcceptedUpdateAt: now, lastMovementInputAt: now,
        movementTimeCreditMs: credit, lastMovementInputSeq: lastSeq });
};
