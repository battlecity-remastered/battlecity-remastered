import { stepTankInput, type TankMovementInput } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimePlayer, RuntimeState } from "./types.js";
import { buildCollisionWorld } from "./collision-world.js";

// Credit follows server time, bounding the total simulation a client can claim.
// Keep enough credit for a delayed TCP burst, without banking idle time forever.
const MAX_TIME_CREDIT_MS = 1000;
export const applyPlayerInputFrames = (state: RuntimeState, player: RuntimePlayer, frames: readonly TankMovementInput[], config: RuntimeConfig): void => {
    const now = Date.now();
    const previousAt = player.lastMovementInputAt ?? player.lastAcceptedUpdateAt ?? now;
    let credit = Math.min(MAX_TIME_CREDIT_MS, (player.movementTimeCreditMs ?? 250) + Math.max(0, now - previousAt));
    let pose = { x: player.x, y: player.y, direction: player.direction };
    let lastSeq = player.lastMovementInputSeq ?? 0;
    const frozen = (player.frozenUntil ?? 0) > now;
    for (const frame of frames) {
        if (frame.seq <= lastSeq) continue;
        const dtMs = Math.min(frame.dtMs, credit);
        const world = buildCollisionWorld(state, config, pose.x + 24, pose.y + 24);
        pose = stepTankInput(pose, { ...frame, dtMs }, config.playerSpeed, world, frozen);
        credit -= dtMs;
        lastSeq = frame.seq;
    }
    Object.assign(player, pose, { speed: config.playerSpeed, lastAcceptedUpdateAt: now, lastMovementInputAt: now,
        movementTimeCreditMs: credit, lastMovementInputSeq: lastSeq });
};
