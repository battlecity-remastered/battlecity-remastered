import test from "node:test";
import assert from "node:assert/strict";
import { decodeKnownEnvelope, makeKnownEnvelope } from "../src/index.js";

test("protocol envelope decode benchmark smoke", () => {
    const event = makeKnownEnvelope("players.snapshot", 1, {
        serverTime: Date.now(),
        players: [{
            id: "p1",
            city: 1,
            direction: 0,
            offset: { x: 10, y: 20 }
        }]
    });
    const encoded = JSON.stringify(event);

    const iterations = 250;
    let successes = 0;
    for (let i = 0; i < iterations; i += 1) {
        const parsed = JSON.parse(encoded);
        const decoded = decodeKnownEnvelope(parsed);
        if (decoded._tag === "Right") {
            successes += 1;
        }
    }

    assert.equal(successes, iterations);
});
