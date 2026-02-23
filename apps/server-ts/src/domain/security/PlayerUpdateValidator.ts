import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimePlayer } from "../../runtime/types.js";
import { distanceSquared } from "../shared/distance.js";

export const validatePlayerUpdate = (
    existing: RuntimePlayer | undefined,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): CommandResult<void> => {
    if (!existing) {
        return { ok: true, value: undefined };
    }

    const max = config.maxPlayerUpdateDistancePerTick;
    const maxSq = max * max;
    const next = payload.offset;
    if (distanceSquared({ x: existing.x, y: existing.y }, next) > maxSq) {
        return rejectResult("invalid_player_update");
    }
    return { ok: true, value: undefined };
};
