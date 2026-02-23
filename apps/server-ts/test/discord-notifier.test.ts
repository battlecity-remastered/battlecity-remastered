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
