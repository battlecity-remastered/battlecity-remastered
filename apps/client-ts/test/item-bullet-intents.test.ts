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

test("ctrl+b emits building.place.request using pointer tile instead of orb drop", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.controls.build = true;
    state.controls.ctrl = true;
    state.pointer.inside = true;
    state.pointer.x = 144;
    state.pointer.y = 96;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const buildingIntent = plan.intents.find((intent) => intent.type === "building.place.request");
    assert.ok(buildingIntent);
    assert.equal(plan.intents.some((intent) => intent.type === "orb.drop.request"), false);
    assert.deepEqual(buildingIntent.payload, {
        ownerId: "local",
        cityId: 2,
        type: 109,
        tileX: 3,
        tileY: 2
    });
});

test("ctrl+demolish emits building.demolish.request for pointer tile building", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 1;
    state.controls.ctrl = true;
    state.controls.demolish = true;
    state.pointer.inside = true;
    state.pointer.x = 101;
    state.pointer.y = 154;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "other",
        cityId: 1,
        type: 109,
        tileX: 2,
        tileY: 3,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const demolishIntent = plan.intents.find((intent) => intent.type === "building.demolish.request");
    assert.ok(demolishIntent);
    assert.equal(plan.intents.some((intent) => intent.type === "hazard.deploy.request"), false);
    assert.deepEqual(demolishIntent.payload, {
        id: "b1",
        cityId: 1
    });
});
