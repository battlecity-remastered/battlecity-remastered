import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { isGhostTileBlocked, resolveGhostPlacement } from "../src/ui/build-menu/GhostPlacement.js";

test("resolveGhostPlacement returns null when placement mode is inactive", () => {
    const state = createClientState();
    state.pointer.inside = true;
    state.controls.ctrl = true;
    state.controls.build = false;
    assert.equal(resolveGhostPlacement(state), null);
});

test("resolveGhostPlacement computes pointer tile and selected build type", () => {
    const state = createClientState();
    state.ui.showBuildMenu = true;
    state.controls.ctrl = true;
    state.controls.build = true;
    state.pointer.inside = true;
    state.pointer.x = 120;
    state.pointer.y = 245;
    state.ui.selectedBuildType = 300;

    const ghost = resolveGhostPlacement(state);
    assert.ok(ghost);
    assert.equal(ghost.tileX, 2);
    assert.equal(ghost.tileY, 5);
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
});
