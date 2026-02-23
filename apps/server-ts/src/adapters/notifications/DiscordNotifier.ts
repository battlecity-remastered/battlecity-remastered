import { Effect } from "effect";
import { logRuntime } from "../../observability/RuntimeLogger.js";

const DISCORD_WEBHOOK_URL_ENV = "DISCORD_WEBHOOK_URL";

const resolveDiscordWebhookUrl = (): string | null => {
    const raw = process.env[DISCORD_WEBHOOK_URL_ENV];
    if (typeof raw !== "string") {
        return null;
    }
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
};

const buildOrbVictoryContent = (playerId: string, sourceCityId: number, targetCityId: number): string => {
    return `Player ${playerId} orbed city ${targetCityId} from city ${sourceCityId}.`;
};

export const notifyOrbVictory = (
    playerId: string,
    sourceCityId: number,
    targetCityId: number
): Effect.Effect<void> => {
    const webhookUrl = resolveDiscordWebhookUrl();
    if (!webhookUrl) {
        return logRuntime("info", "discord.notify.skipped", {
            reason: "webhook_not_configured",
            playerId,
            sourceCityId,
            targetCityId
        });
    }

    return Effect.tryPromise({
        try: () => fetch(webhookUrl, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                content: buildOrbVictoryContent(playerId, sourceCityId, targetCityId)
            })
        }),
        catch: () => new Error("discord_notify_failed")
    }).pipe(
        Effect.flatMap((response) => {
            if (response.ok) {
                return logRuntime("info", "discord.notify.orb_victory", {
                    playerId,
                    sourceCityId,
                    targetCityId
                });
            }
            return logRuntime("warn", "discord.notify.rejected", {
                playerId,
                sourceCityId,
                targetCityId,
                status: response.status
            });
        }),
        Effect.catchAll(() => logRuntime("error", "discord.notify.failed", {
            playerId,
            sourceCityId,
            targetCityId
        })),
        Effect.asVoid
    );
};

export const __internal = {
    resolveDiscordWebhookUrl,
    buildOrbVictoryContent
};

export const DISCORD_WEBHOOK_URL = DISCORD_WEBHOOK_URL_ENV;
