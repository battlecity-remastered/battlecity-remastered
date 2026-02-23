import { Effect } from "effect";
import { logRuntime } from "../../observability/RuntimeLogger.js";

export const notifyOrbVictory = (
    playerId: string,
    sourceCityId: number,
    targetCityId: number
): Effect.Effect<void> => {
    return logRuntime("info", "discord.notify.orb_victory", {
        playerId,
        sourceCityId,
        targetCityId
    });
};
