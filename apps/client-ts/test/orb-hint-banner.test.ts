import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildOrbHintLines } from "../src/ui/orb/OrbHintBanner.js";

test("buildOrbHintLines returns warning text when local city is orbed", () => {
    const state = createClientState();
    state.local.city = 2;
    state.events.lastOrbEvent = {
        sourceCityId: 1,
        targetCityId: 2,
        by: "enemy",
        awardedScore: 250,
        at: 1_000
    };

    const lines = buildOrbHintLines(state, 1_200);
    assert.ok(lines);
    assert.equal(lines?.[0], "Warning: Your city was orbed");
});

test("buildOrbHintLines returns success text when local player performed orb", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 2;
    state.events.lastOrbEvent = {
        sourceCityId: 2,
        targetCityId: 3,
        by: "p1",
        awardedScore: 300,
        at: 1_000
    };

    const lines = buildOrbHintLines(state, 1_200);
    assert.ok(lines);
    assert.equal(lines?.[0], "Orb strike successful on city 3");
});

test("buildOrbHintLines expires after ttl", () => {
    const state = createClientState();
    state.events.lastOrbEvent = {
        sourceCityId: 1,
        targetCityId: 2,
        by: "enemy",
        awardedScore: 250,
        at: 1_000
    };
    assert.equal(buildOrbHintLines(state, 9_001), null);
});
