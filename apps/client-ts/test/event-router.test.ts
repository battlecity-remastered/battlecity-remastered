import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { makeEnvelope } from "@battlecity/protocol";
import { decodeServerEnvelope } from "../src/network/event-router.js";

test("decodeServerEnvelope accepts canonical event types", () => {
    const decoded = Effect.runSync(decodeServerEnvelope(makeEnvelope("lobby.join.request", 1, {
        desiredCity: 2
    })));

    assert.ok(decoded);
    assert.equal(decoded?.type, "lobby.join.request");
});

test("decodeServerEnvelope canonicalizes classic alias event types", () => {
    const decoded = Effect.runSync(decodeServerEnvelope({
        type: "population:update",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            id: "building_1",
            cityId: 1,
            type: 109,
            tileX: 10,
            tileY: 10,
            population: 12,
            removed: false
        }
    }));

    assert.ok(decoded);
    assert.equal(decoded?.type, "population.update");
});

test("decodeServerEnvelope canonicalizes classic rejection alias", () => {
    const decoded = Effect.runSync(decodeServerEnvelope({
        type: "event:rejected",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            reason: "ValidationFailed"
        }
    }));

    assert.ok(decoded);
    assert.equal(decoded?.type, "event.rejected");
});

test("decodeServerEnvelope returns null for malformed payloads", () => {
    const decoded = Effect.runSync(decodeServerEnvelope({
        type: "lobby.join.request",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            desiredCity: "bad-city"
        }
    }));

    assert.equal(decoded, null);
});
