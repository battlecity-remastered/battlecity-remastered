import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { ITEM_TYPE_SLEEPER, ITEM_TYPE_TURRET } from "../src/render/parity/constants.js";
import { isDefenseVisibleToLocalPlayer, resolveVisibleDefenseIds } from "../src/render/parity/defense-visibility.js";

test("non-sleeper defenses remain visible regardless of distance", () => {
    const state = createClientState();
    state.local.city = 1;
    state.local.x = 0;
    state.local.y = 0;
    assert.equal(
        isDefenseVisibleToLocalPlayer(state, {
            id: "turret-far",
            cityId: 2,
            type: ITEM_TYPE_TURRET,
            tileX: 128,
            tileY: 128
        }),
        true
    );
});

test("friendly sleepers stay visible", () => {
    const state = createClientState();
    state.local.city = 4;
    state.local.x = 0;
    state.local.y = 0;
    assert.equal(
        isDefenseVisibleToLocalPlayer(state, {
            id: "friendly-sleeper",
            cityId: 4,
            type: ITEM_TYPE_SLEEPER,
            tileX: 64,
            tileY: 64
        }),
        true
    );
});

test("enemy sleepers are hidden outside legacy 400px targeting range", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 0;
    state.local.y = 0;
    assert.equal(
        isDefenseVisibleToLocalPlayer(state, {
            id: "enemy-sleeper-far",
            cityId: 2,
            type: ITEM_TYPE_SLEEPER,
            tileX: 9,
            tileY: 0
        }),
        false
    );
});

test("enemy sleepers become visible once inside legacy targeting range", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 0;
    state.local.y = 0;
    assert.equal(
        isDefenseVisibleToLocalPlayer(state, {
            id: "enemy-sleeper-near",
            cityId: 2,
            type: ITEM_TYPE_SLEEPER,
            tileX: 8,
            tileY: 0
        }),
        true
    );
});

test("visible defense id list excludes hidden enemy sleepers", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 0;
    state.local.y = 0;

    state.defenses.set("enemy-sleeper-far", {
        id: "enemy-sleeper-far",
        cityId: 2,
        type: ITEM_TYPE_SLEEPER,
        tileX: 9,
        tileY: 0,
        health: 16,
        maxHealth: 16
    });

    state.defenses.set("enemy-sleeper-near", {
        id: "enemy-sleeper-near",
        cityId: 2,
        type: ITEM_TYPE_SLEEPER,
        tileX: 8,
        tileY: 0,
        health: 16,
        maxHealth: 16
    });

    state.defenses.set("enemy-turret-far", {
        id: "enemy-turret-far",
        cityId: 2,
        type: ITEM_TYPE_TURRET,
        tileX: 128,
        tileY: 0,
        health: 32,
        maxHealth: 32
    });

    const visible = resolveVisibleDefenseIds(state).sort();
    assert.deepEqual(visible, ["enemy-sleeper-near", "enemy-turret-far"]);
});
