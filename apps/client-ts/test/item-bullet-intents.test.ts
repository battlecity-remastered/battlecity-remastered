import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildTickPlan } from "../src/app/intents.js";

const collectTypes = (state = createClientState()): string[] => {
    state.local.id = "local";
    state.local.city = 2;
    return buildTickPlan(state, Date.now() + 10_000, 100).intents.map((intent) => intent.type);
};

test("shoot control emits bullet.fire.request intent", () => {
    const state = createClientState();
    state.controls.shoot = true;
    const types = collectTypes(state);
    assert.ok(types.includes("bullet.fire.request"));
});

test("collect/use/hazard controls emit item lifecycle intents", () => {
    const state = createClientState();
    state.controls.collectFactory = true;
    state.controls.useItem = true;
    state.controls.demolish = true;

    const types = collectTypes(state);
    assert.ok(types.includes("icon.pickup.request"));
    assert.ok(types.includes("item.use.request"));
    assert.ok(types.includes("hazard.deploy.request"));
});
