import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { moveLocalPlayer } from "../src/gameplay/player-movement.js";

test("moveLocalPlayer advances local player when no blocking entities exist", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 128;
    state.local.y = 128;
    state.local.speed = 300;

    moveLocalPlayer(state, 0, 1, 100);

    assert.equal(Math.round(state.local.x), 128);
    assert.equal(Math.round(state.local.y), 98);
});

test("moveLocalPlayer supports reverse movement with negative throttle", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 128;
    state.local.y = 128;
    state.local.speed = 300;

    moveLocalPlayer(state, 0, -1, 100);

    assert.equal(Math.round(state.local.x), 128);
    assert.equal(Math.round(state.local.y), 158);
});

test("moveLocalPlayer does not pass through blocking building tile", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 130;
    state.local.y = 120;
    state.local.speed = 300;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 1,
        type: 109,
        tileX: 3,
        tileY: 2,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    moveLocalPlayer(state, 8, 1, 100);

    assert.ok(state.local.x < (3 * 48));
});

test("moveLocalPlayer does not pass through blocking terrain tiles", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 130;
    state.local.y = 130;
    state.local.speed = 300;
    state.world.blockingTiles.add("3,3");

    moveLocalPlayer(state, 8, 1, 100);

    assert.ok(state.local.x < (3 * 48));
});

test("moveLocalPlayer unsticks from blocked tile using nearest-safe fallback", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 80;
    state.local.y = 80;
    state.local.speed = 0;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 1,
        type: 109,
        tileX: 1,
        tileY: 1,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    moveLocalPlayer(state, 0, 0, 16);

    assert.notEqual(Math.round(state.local.x), 80);
    assert.notEqual(Math.round(state.local.y), 80);
});

test("moveLocalPlayer allows driving over bottom row of factory/cc/hospital families", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 40;
    state.local.y = 200;
    state.local.speed = 300;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 1,
        type: 100,
        tileX: 2,
        tileY: 2,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    moveLocalPlayer(state, 8, 1, 100);

    assert.ok(state.local.x > 40);
});

test("moveLocalPlayer blocks bottom-row overlap for non-drive-through building families", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.x = 40;
    state.local.y = 200;
    state.local.speed = 300;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 2,
        tileY: 2,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    moveLocalPlayer(state, 8, 1, 100);

    assert.ok(state.local.x <= 40);
});
