import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimePlayer } from "../../runtime/types.js";
import { distanceSquared } from "../shared/distance.js";
import type { TankMovementInput } from "@battlecity/sim-core";

const MIN_DISTANCE_ALLOWANCE_PX = 31;
const MAX_DISTANCE_ALLOWANCE_PX = 385;
const JITTER_HEADROOM_MULTIPLIER = 3.108;

const validInputFrame = (frame: TankMovementInput): boolean => Number.isSafeInteger(frame.seq)
    && frame.seq > 0 && Number.isFinite(frame.dtMs) && frame.dtMs > 0 && frame.dtMs <= 100
    && [-1, 0, 1].includes(frame.turn) && [-1, 0, 1].includes(frame.throttle);

const validInputFrames = (frames: readonly TankMovementInput[], lastSeq: number): boolean => {
    if (frames.length > 32) return false;
    let expected = lastSeq + 1;
    for (const frame of frames) {
        if (!validInputFrame(frame)) return false;
        if (frame.seq < expected) continue;
        if (frame.seq !== expected) return false;
        expected++;
    }
    return true;
};

const resolveAdaptiveDistanceAllowance = (
    existing: RuntimePlayer,
    config: RuntimeConfig,
    nowMs: number
): number => {
    const base = config.maxPlayerUpdateDistancePerTick;
    const previousAt = typeof existing.lastAcceptedUpdateAt === "number"
        ? existing.lastAcceptedUpdateAt
        : (nowMs - config.serverStepMs);
    const elapsedMs = Math.max(config.serverStepMs, nowMs - previousAt);
    const speed = Number.isFinite(existing.speed) ? Math.max(0, existing.speed) : config.playerSpeed;
    const travelDistance = speed * (elapsedMs / 1000);
    const adaptive = (travelDistance * JITTER_HEADROOM_MULTIPLIER) + MIN_DISTANCE_ALLOWANCE_PX;
    return Math.min(MAX_DISTANCE_ALLOWANCE_PX, Math.max(base, adaptive));
};

export const validatePlayerUpdate = (
    existing: RuntimePlayer | undefined,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): CommandResult<void> => {
    if (![payload.direction, payload.offset.x, payload.offset.y].every(Number.isFinite)) {
        return rejectResult("invalid_player_update");
    }
    if (payload.throttle !== undefined && (!Number.isFinite(payload.throttle) || Math.abs(payload.throttle) > 1)) {
        return rejectResult("invalid_player_update");
    }
    if (payload.inputFrames !== undefined && !validInputFrames(payload.inputFrames, existing?.lastMovementInputSeq ?? 0)) return rejectResult("invalid_player_update");
    if (!existing) {
        return { ok: true, value: undefined };
    }

    // Three.js sends explicit throttle intents with a locally predicted offset.
    // The server integrates these from its own position and never adopts that
    // offset. Rejecting prediction drift would discard legitimate WAN input and
    // prevent its authoritative movement from catching up with the client.
    if (payload.throttle !== undefined || payload.inputFrames !== undefined) return { ok: true, value: undefined };

    const nowMs = Date.now();
    const max = resolveAdaptiveDistanceAllowance(existing, config, nowMs);
    const maxSq = max * max;
    const next = payload.offset;
    if (distanceSquared({ x: existing.x, y: existing.y }, next) > maxSq) {
        return rejectResult("invalid_player_update");
    }
    return { ok: true, value: undefined };
};
