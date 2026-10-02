import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { makeEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import type { JoinNotification } from "../src/adapters/notifications/DiscordNotifier.js";

test("successful human joins notify once with persisted profile and role", async () => {
    const notifications: JoinNotification[] = [];
    const runtime = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: () => {} }, {}, undefined, {
        userStore: new UserStoreAdapter({ useSqlStorage: false }),
        notifyPlayerJoin: details => Effect.sync(() => { notifications.push(details); })
    });
    runtime.handleRawEvent("human", makeEnvelope("lobby.join.request", 1, { desiredCity: 0, callsign: "Pilot" }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.callsign, "Pilot");
    assert.equal(notifications[0]?.city, 0);
    assert.equal(notifications[0]?.role, "Mayor");
    runtime.handleRawEvent("human", makeEnvelope("lobby.join.request", 2, { desiredCity: 0, callsign: "Pilot" }));
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(notifications.length, 1, "duplicate join requests do not spam Discord");
});
