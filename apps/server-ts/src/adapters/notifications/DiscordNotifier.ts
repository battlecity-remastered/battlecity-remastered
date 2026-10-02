import { Effect } from "effect";
import { logRuntime } from "../../observability/RuntimeLogger.js";
import citySpawns from "../../../data/citySpawns.json" with { type: "json" };

export type NotificationProfile = { callsign: string; rankTitle: string; points?: number };
export type JoinNotification = NotificationProfile & { city: number; role: string };
const env = (key: string): string | null => process.env[key]?.trim() || null;
const resolveDiscordWebhookUrl = (): string | null => env("DISCORD_WEBHOOK_URL");
const cityName = (city: number): string =>
    (citySpawns as Record<string, { name: string }>)[String(city)]?.name ?? `City ${city}`;
const buildOrbVictoryContent = (playerId: string, source: number, target: number, profile?: NotificationProfile): string =>
    `[${profile?.rankTitle || "Unranked"}] ${profile?.callsign || playerId} orbed ${cityName(target)}` +
    `${source === target ? "" : ` for ${cityName(source)}`}${profile?.points ? ` (+${Math.floor(profile.points)} pts)` : ""}.`;
const buildJoinContent = (details: JoinNotification): string =>
    `[${details.rankTitle || "Unranked"}] ${details.callsign} joined ${cityName(details.city)} as ${details.role}.`;
const positiveSetting = (key: string, fallback: number): number => {
    const value = Number(env(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
};
const resolveTransport = (): { url: string; headers: Record<string, string> } | null => {
    const token = env("DISCORD_BOT_TOKEN"), channel = env("DISCORD_CHANNEL_ID");
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "User-Agent": "DiscordBot (https://playbattlecity.com, 1.1)"
    };
    if (token && channel) return {
        url: `https://discord.com/api/v10/channels/${encodeURIComponent(channel)}/messages`,
        headers: { ...headers, Authorization: `Bot ${token}` }
    };
    const webhook = resolveDiscordWebhookUrl();
    return webhook ? { url: webhook, headers } : null;
};
let nextAllowedAt = 0;
let inFlight = false;
const send = (content: string, event: string): Effect.Effect<void> => Effect.tryPromise({
    try: async () => {
        const transport = resolveTransport();
        if (!transport || inFlight || Date.now() < nextAllowedAt) return;
        inFlight = true;
        try {
            const response = await fetch(transport.url, {
                method: "POST", headers: transport.headers,
                body: JSON.stringify({ content: content.slice(0, 1800), allowed_mentions: { parse: [] } }),
                signal: AbortSignal.timeout(positiveSetting("DISCORD_REQUEST_TIMEOUT_MS", 5000))
            });
            if (response.ok) nextAllowedAt = Date.now() + positiveSetting("DISCORD_MIN_INTERVAL_MS", 10000);
            if (response.status === 429) {
                const body = await response.json() as { retry_after?: number };
                nextAllowedAt = Date.now() + Math.max(1000, Number(body.retry_after || 1) * 1000);
            }
            await Effect.runPromise(logRuntime(response.ok ? "info" : "warn", event, { status: response.status }));
        } finally {
            inFlight = false;
        }
    },
    catch: () => new Error("discord_notify_failed")
}).pipe(Effect.catchAll(() => logRuntime("error", "discord.notify.failed", { event })), Effect.asVoid);

export const notifyOrbVictory = (playerId: string, source: number, target: number, profile?: NotificationProfile): Effect.Effect<void> =>
    send(buildOrbVictoryContent(playerId, source, target, profile), "discord.notify.orb_victory");
export const notifyPlayerJoin = (details: JoinNotification): Effect.Effect<void> =>
    send(buildJoinContent(details), "discord.notify.player_join");
export const __internal = { resolveDiscordWebhookUrl, buildOrbVictoryContent, buildJoinContent, resolveTransport,
    resetRateLimit: (): void => { nextAllowedAt = 0; inFlight = false; } };
export const DISCORD_WEBHOOK_URL = "DISCORD_WEBHOOK_URL";
