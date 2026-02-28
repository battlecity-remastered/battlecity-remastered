import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimePlayer } from "../../runtime/types.js";
import { distanceSquared } from "../shared/distance.js";

const MIN_DISTANCE_ALLOWANCE_PX = 31;
const MAX_DISTANCE_ALLOWANCE_PX = 385;
const JITTER_HEADROOM_MULTIPLIER = 3.108;

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
    if (!existing) {
        return { ok: true, value: undefined };
    }

    const nowMs = Date.now();
    const max = resolveAdaptiveDistanceAllowance(existing, config, nowMs);
    const maxSq = max * max;
    const next = payload.offset;
    if (distanceSquared({ x: existing.x, y: existing.y }, next) > maxSq) {
        return rejectResult("invalid_player_update");
    }
    return { ok: true, value: undefined };
};
