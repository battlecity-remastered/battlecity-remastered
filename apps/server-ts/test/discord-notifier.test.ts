import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import {
    __internal,
    DISCORD_WEBHOOK_URL,
    notifyOrbVictory
} from "../src/adapters/notifications/DiscordNotifier.js";

test("resolveDiscordWebhookUrl trims configured webhook values", () => {
    const previous = process.env[DISCORD_WEBHOOK_URL];
    try {
        process.env[DISCORD_WEBHOOK_URL] = "  https://discord.example/hook  ";
        const resolved = __internal.resolveDiscordWebhookUrl();
        assert.equal(resolved, "https://discord.example/hook");
    } finally {
        if (previous === undefined) {
            delete process.env[DISCORD_WEBHOOK_URL];
        } else {
            process.env[DISCORD_WEBHOOK_URL] = previous;
        }
    }
});

test("notifyOrbVictory posts to configured webhook", async () => {
    const previousWebhook = process.env[DISCORD_WEBHOOK_URL];
    const previousFetch = globalThis.fetch;
    const calls: Array<{ input: string; body: string | null }> = [];

    try {
        process.env[DISCORD_WEBHOOK_URL] = "https://discord.example/hook";
        globalThis.fetch = (async (input: unknown, init?: { body?: unknown }): Promise<Response> => {
            calls.push({
                input: String(input),
                body: typeof init?.body === "string" ? init.body : null
            });
            return new Response(null, { status: 204 });
        }) as typeof fetch;

        await Effect.runPromise(notifyOrbVictory("u-attacker", 1, 2));

        assert.equal(calls.length, 1);
        assert.equal(calls[0]?.input, "https://discord.example/hook");
        assert.ok(calls[0]?.body?.includes("u-attacker"));
    } finally {
        if (previousWebhook === undefined) {
            delete process.env[DISCORD_WEBHOOK_URL];
        } else {
            process.env[DISCORD_WEBHOOK_URL] = previousWebhook;
        }
        globalThis.fetch = previousFetch;
    }
});

test("bot credentials restore ranked join and orb messages without mentions", async () => {
    const keys = ["DISCORD_BOT_TOKEN", "DISCORD_CHANNEL_ID", "DISCORD_WEBHOOK_URL"];
    const previous = keys.map(key => process.env[key]);
    const previousFetch = globalThis.fetch;
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    try {
        process.env.DISCORD_BOT_TOKEN = "test-token";
        process.env.DISCORD_CHANNEL_ID = "12345";
        process.env.DISCORD_WEBHOOK_URL = "https://discord.example/unused";
        globalThis.fetch = (async (input, init) => {
            calls.push({ url: String(input), init });
            return new Response(null, { status: 200 });
        }) as typeof fetch;
        __internal.resetRateLimit();
        const { notifyPlayerJoin } = await import("../src/adapters/notifications/DiscordNotifier.js");
        await Effect.runPromise(notifyPlayerJoin({ callsign: "B-rad 😎", rankTitle: "General", city: 0, role: "Mayor" }));
        assert.equal(calls[0]?.url, "https://discord.com/api/v10/channels/12345/messages");
        assert.equal(new Headers(calls[0]?.init?.headers).get("Authorization"), "Bot test-token");
        assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {
            content: "[General] B-rad 😎 joined Balkh as Mayor.", allowed_mentions: { parse: [] }
        });
        await Effect.runPromise(notifyOrbVictory("private-account-id", 0, 1));
        assert.equal(calls.length, 1, "normal minimum interval prevents notification storms");
        __internal.resetRateLimit();
        await Effect.runPromise(notifyOrbVictory("private-account-id", 0, 1, {
            callsign: "B-rad 😎", rankTitle: "General", points: 100
        }));
        assert.equal(JSON.parse(String(calls[1]?.init?.body)).content,
            "[General] B-rad 😎 orbed Iqaluit for Balkh (+100 pts).");
        assert.ok(calls[1]?.init?.signal);
        __internal.resetRateLimit();
        globalThis.fetch = (async () => new Response(JSON.stringify({ retry_after: 30 }), { status: 429 })) as typeof fetch;
        await Effect.runPromise(notifyOrbVictory("player", 0, 1));
        globalThis.fetch = previousFetch;
        await Effect.runPromise(notifyOrbVictory("player", 0, 1)); // suppressed; never performs a live request
        __internal.resetRateLimit();
        globalThis.fetch = (async () => { throw new Error("network unavailable"); }) as typeof fetch;
        await Effect.runPromise(notifyOrbVictory("player", 0, 1)); // transport errors never reject gameplay
    } finally {
        keys.forEach((key, index) => {
            if (previous[index] === undefined) delete process.env[key]; else process.env[key] = previous[index];
        });
        globalThis.fetch = previousFetch;
        __internal.resetRateLimit();
    }
});
