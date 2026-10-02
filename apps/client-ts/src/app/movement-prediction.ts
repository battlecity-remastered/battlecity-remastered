import { stepTankInput, type TankMovementInput } from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state-types.js";
import { createPlayerCollisionWorld } from "../gameplay/player-movement.js";
import { LEGACY_PLAYER_SPEED_PX_PER_SECOND } from "./player-constants.js";

type SnapshotPlayer = KnownEventPayloadByType["players.snapshot"]["players"][number];
export const resetMovementPrediction = (state: ClientState): void => {
    state.movement = { nextSeq: 1, lastAck: 0, lastSentSeq: 0, pending: [], visualOffsetX: 0, visualOffsetY: 0, correctionPx: 0, maxCorrectionPx: 0 };
};

const applyFrame = (state: ClientState, frame: TankMovementInput): void => {
    const world = createPlayerCollisionWorld(state);
    Object.assign(state.local, stepTankInput(state.local, frame, LEGACY_PLAYER_SPEED_PX_PER_SECOND, world, (state.local.frozenUntil ?? 0) > Date.now()));
};

export const advancePredictedMovement = (state: ClientState, elapsed: number): void => {
    if (!state.local.id || elapsed <= 0 || state.movement.pending.length >= 240) return;
    const frame = { seq: state.movement.nextSeq++, dtMs: Math.min(100, elapsed),
        turn: Number(state.controls.turnRight) - Number(state.controls.turnLeft),
        throttle: Number(state.controls.moveForward) - Number(state.controls.moveBackward) };
    applyFrame(state, frame);
    state.movement.pending.push(frame);
};

export const takeUnsentMovementFrames = (state: ClientState): TankMovementInput[] => {
    const frames = state.movement.pending.filter(frame => frame.seq > state.movement.lastSentSeq).slice(0, 32);
    if (frames.length) state.movement.lastSentSeq = frames[frames.length - 1]!.seq;
    return frames;
};

export const reconcilePredictedMovement = (state: ClientState, player: SnapshotPlayer): void => {
    const ack = player.movementAck!;
    if (ack.seq < state.movement.lastAck) return;
    const previousX = state.local.x, previousY = state.local.y;
    state.movement.lastAck = ack.seq;
    state.movement.pending = state.movement.pending.filter(frame => frame.seq > ack.seq);
    Object.assign(state.local, { x: player.offset.x, y: player.offset.y, direction: ack.direction });
    for (const frame of state.movement.pending) applyFrame(state, frame);
    const dx = previousX - state.local.x, dy = previousY - state.local.y;
    state.movement.correctionPx = Math.hypot(dx, dy);
    state.movement.maxCorrectionPx = Math.max(state.movement.maxCorrectionPx, state.movement.correctionPx);
    // Smooth only the rendered correction. Simulation and placement use the
    // authoritative pose plus unacknowledged inputs, with no interpolation lag.
    if (dx * dx + dy * dy < 192 * 192) {
        state.movement.visualOffsetX += dx;
        state.movement.visualOffsetY += dy;
    } else state.movement.visualOffsetX = state.movement.visualOffsetY = 0;
};
