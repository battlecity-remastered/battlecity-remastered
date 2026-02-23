import test from "node:test";
import assert from "node:assert/strict";
import { decodeServerEnvelope } from "../src/network/event-router.js";
import { Effect } from "effect";

test("client decode router benchmark smoke", () => {
    const envelope = {
        type: "player:health",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            id: "p1",
            health: 75,
            maxHealth: 100
        }
    };

    const iterations = 250;
    let decodedCount = 0;
    for (let i = 0; i < iterations; i += 1) {
        const decoded = Effect.runSync(decodeServerEnvelope(envelope));
        if (decoded?.type === "player.health") {
            decodedCount += 1;
        }
    }

    assert.equal(decodedCount, iterations);
});
