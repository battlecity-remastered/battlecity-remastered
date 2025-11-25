"use strict";

const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const https = require("https");
const { test, mock } = require("node:test");

const { DiscordNotifier } = require("../src/utils/DiscordNotifier");

test("uses discord.js REST helper when provided", async () => {
    class FakeRest {
        constructor(options) {
            this.options = options;
            this.token = null;
            this.calls = [];
        }

        setToken(token) {
            this.token = token;
            return this;
        }

        post(route, payload) {
            this.calls.push({ route, payload });
            return Promise.resolve();
        }
    }

    const Routes = {
        channelMessages: (channelId) => `/api/v10/channels/${channelId}/messages`
    };

    const notifier = new DiscordNotifier({
        token: "test-token",
        channelId: "12345",
        requestTimeoutMs: 2500,
        discordModule: { REST: FakeRest, Routes }
    });

    await notifier.send("hello world");

    assert.equal(notifier.rest.token, "test-token");
    assert.equal(notifier.rest.options.timeout, 2500);
    assert.equal(notifier.rest.calls.length, 1);
    assert.equal(notifier.rest.calls[0].route, "/api/v10/channels/12345/messages");
    assert.deepEqual(notifier.rest.calls[0].payload, { body: { content: "hello world" } });
});

test("falls back to HTTPS client when discord.js is unavailable", async (t) => {
    const requests = [];

    class FakeRequest extends EventEmitter {
        constructor(callback) {
            super();
            this.callback = callback;
            this.body = "";
        }

        write(chunk) {
            this.body += chunk;
        }

        end() {
            const response = new EventEmitter();
            response.statusCode = 204;
            response.setEncoding = () => {};
            process.nextTick(() => {
                this.callback(response);
                response.emit("data", "");
                response.emit("end");
            });
        }

        setTimeout() {}
    }

    t.after(() => {
        mock.restoreAll();
    });

    mock.method(https, "request", (options, callback) => {
        const request = new FakeRequest(callback);
        requests.push({ options, request });
        return request;
    });

    const notifier = new DiscordNotifier({
        token: "fallback-token",
        channelId: "67890",
        discordModule: null
    });

    await notifier.send("via https");

    assert.equal(requests.length, 1);
    assert.equal(requests[0].options.path, "/api/v10/channels/67890/messages");
    assert.equal(requests[0].options.headers.Authorization, "Bot fallback-token");
    assert.ok(requests[0].request.body.includes("via https"));
});
