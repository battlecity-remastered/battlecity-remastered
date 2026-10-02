import { MAX_PENDING_TANK_INPUT_MS, stepTankInput, type TankMovementInput } from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state-types.js";
import { createPlayerCollisionWorld } from "../gameplay/player-movement.js";
import { LEGACY_PLAYER_SPEED_PX_PER_SECOND } from "./player-constants.js";
import { createMovementState } from "./movement-state.js";

type SnapshotPlayer = KnownEventPayloadByType["players.snapshot"]["players"][number];
export const resetMovementPrediction = (state: ClientState): void => {
    state.movement = createMovementState();
};

const applyFrame = (state: ClientState, frame: TankMovementInput): void => {
    const world = createPlayerCollisionWorld(state);
    Object.assign(state.local, stepTankInput(state.local, frame, LEGACY_PLAYER_SPEED_PX_PER_SECOND, world, (state.local.frozenUntil ?? 0) > Date.now()));
};

export const advancePredictedMovement = (state: ClientState, elapsed: number): void => {
    const dtMs = Math.min(100, elapsed, MAX_PENDING_TANK_INPUT_MS - state.movement.pendingMs);
    if (!state.local.id || dtMs <= 0 || state.movement.pending.length >= 240) return;
    const frame = { seq: state.movement.nextSeq++, dtMs,
        turn: Number(state.controls.turnRight) - Number(state.controls.turnLeft),
        throttle: Number(state.controls.moveForward) - Number(state.controls.moveBackward) };
    applyFrame(state, frame);
    state.movement.pending.push(frame);
    state.movement.pendingMs += dtMs;
};

export const takeUnsentMovementFrames = (state: ClientState, now = Date.now()): TankMovementInput[] => {
    // Socket.IO delivery is reliable, but a rejected command is not an ack.
    // Retry the unacknowledged prefix so one dropped command cannot wedge the
    // stream forever. Duplicates are harmless at the authority.
    if (state.movement.retryAt && now >= state.movement.retryAt) {
        state.movement.lastSentSeq = state.movement.lastAck;
        state.movement.retryAt = now + 1000;
    }
    const frames = state.movement.pending.filter(frame => frame.seq > state.movement.lastSentSeq).slice(0, 32);
    if (frames.length) { state.movement.lastSentSeq = frames[frames.length - 1]!.seq; state.movement.retryAt ||= now + 1000; }
    return frames;
};

export const reconcilePredictedMovement = (state: ClientState, player: SnapshotPlayer): void => {
    const ack = player.movementAck!;
    if (ack.seq < state.movement.lastAck) return;
    const previousX = state.local.x, previousY = state.local.y;
    if (ack.seq > state.movement.lastAck) state.movement.retryAt = Date.now() + 1000;
    state.movement.lastAck = ack.seq;
    state.movement.serverClippedMs = ack.clippedMs ?? 0;
    state.movement.pending = state.movement.pending.filter(frame => frame.seq > ack.seq);
    state.movement.pendingMs = state.movement.pending.reduce((sum, frame) => sum + frame.dtMs, 0);
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
