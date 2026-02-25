import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildOrbHintText } from "../src/ui/orb/OrbHintBanner.js";

test("buildOrbHintText returns empty string while not joined", () => {
    const state = createClientState();
    assert.equal(buildOrbHintText(state), "");
});

test("buildOrbHintText returns fallback when no orbable city is known", () => {
    const state = createClientState();
    state.local.id = "p1";
    assert.equal(buildOrbHintText(state), "No orbable cities detected yet.");
});

test("buildOrbHintText renders nearest orbable direction line", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 0;
    state.local.x = 480;
    state.local.y = 480;

    state.cityFinance.set(1, {
        cash: 1,
        income: 1,
        score: 0,
        researchLevel: 0,
        isOrbable: true
    });
    state.buildings.set("enemy-cc-near", {
        id: "enemy-cc-near",
        ownerId: "enemy-1",
        cityId: 1,
        type: 0,
        tileX: 14,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    const text = buildOrbHintText(state);
    assert.equal(text, "Nearest orbable city: Iqaluit - East (~5 tiles)");
});
