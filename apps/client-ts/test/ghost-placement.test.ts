import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { isGhostTileBlocked, resolveGhostPlacement } from "../src/ui/build-menu/GhostPlacement.js";

test("resolveGhostPlacement returns null when placement mode is inactive", () => {
    const state = createClientState();
    state.pointer.inside = true;
    state.ui.buildGhostMode = false;
    assert.equal(resolveGhostPlacement(state), null);
});

test("resolveGhostPlacement computes pointer tile and selected build type", () => {
    const state = createClientState();
    state.ui.buildGhostMode = true;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 209;
    state.pointer.y = 357;
    state.local.x = 83;
    state.local.y = 99;
    state.ui.selectedBuildType = 300;

    const ghost = resolveGhostPlacement(state);
    assert.ok(ghost);
    assert.equal(ghost.tileX, 0);
    assert.equal(ghost.tileY, 3);
    assert.equal(ghost.buildType, 300);
    assert.equal(ghost.blocked, false);
});

test("isGhostTileBlocked returns true for building and defense occupancy", () => {
    const state = createClientState();
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "owner",
        cityId: 1,
        type: 109,
        tileX: 3,
        tileY: 4,
        health: 100,
        maxHealth: 100,
        population: 0
    });
    state.defenses.set("d1", {
        id: "d1",
        cityId: 1,
        type: 8,
        tileX: 7,
        tileY: 8,
        health: 10,
        maxHealth: 10
    });

    assert.equal(isGhostTileBlocked(state, 3, 4), true);
    assert.equal(isGhostTileBlocked(state, 7, 8), true);
    assert.equal(isGhostTileBlocked(state, 1, 1), false);

    state.world.blockingTiles.add("9,9");
    assert.equal(isGhostTileBlocked(state, 8, 8), true);
});

test("isGhostTileBlocked prefers build-blocking terrain set when available", () => {
    const state = createClientState();
    state.world.blockingTiles.add("10,10");
    state.world.blockingTiles.add("10,11");
    state.world.buildBlockingTiles.add("10,10");
    state.world.buildBlockingTiles.add("10,11");
    state.world.buildBlockingTiles.add("10,12");

    assert.equal(isGhostTileBlocked(state, 10, 12), true);
});
