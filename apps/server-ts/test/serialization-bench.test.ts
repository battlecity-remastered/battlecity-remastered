import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope } from "@battlecity/protocol";
import { normalizeInboundEnvelopeType } from "../src/runtime/event-adapter.js";

test("server ingress normalization benchmark smoke", () => {
    const raw = makeEnvelope("population:update", 1, {
        id: "b1",
        cityId: 1,
        type: 109,
        tileX: 1,
        tileY: 2,
        population: 10,
        removed: false
    });

    const iterations = 250;
    let canonicalCount = 0;
    for (let i = 0; i < iterations; i += 1) {
        const normalized = normalizeInboundEnvelopeType(raw) as { type?: string };
        if (normalized.type === "population.update") {
            canonicalCount += 1;
        }
    }

    assert.equal(canonicalCount, iterations);
});
