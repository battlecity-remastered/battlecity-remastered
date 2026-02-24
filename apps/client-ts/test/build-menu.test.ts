import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    applyBuildMenuHotkey,
    buildBuildMenuLines,
    resolveBuildTypeHotkey
} from "../src/ui/build-menu/BuildMenu.js";

test("resolveBuildTypeHotkey maps known numeric shortcuts", () => {
    assert.equal(resolveBuildTypeHotkey("1"), 300);
    assert.equal(resolveBuildTypeHotkey("2"), 412);
    assert.equal(resolveBuildTypeHotkey("5"), 200);
    assert.equal(resolveBuildTypeHotkey("0"), null);
});

test("applyBuildMenuHotkey toggles visibility and updates selected build type", () => {
    const state = createClientState();
    assert.equal(state.ui.showBuildMenu, false);
    assert.equal(state.ui.selectedBuildType, 300);

    assert.equal(applyBuildMenuHotkey(state, "F4"), true);
    assert.equal(state.ui.showBuildMenu, true);

    assert.equal(applyBuildMenuHotkey(state, "3"), true);
    assert.equal(state.ui.showBuildMenu, true);
    assert.equal(state.ui.selectedBuildType, 401);
});

test("buildBuildMenuLines includes selected marker", () => {
    const state = createClientState();
    state.local.id = "mayor-1";
    state.local.city = 3;
    state.lobby.assignments = [{ city: 3, mayorId: "mayor-1", recruitCount: 2 }];
    state.ui.selectedBuildType = 300;
    const lines = buildBuildMenuLines(state);

    assert.equal(lines[0], "Build Menu");
    assert.ok(lines.some((line) => line.includes("Role: Mayor")));
    assert.ok(lines.some((line) => line.includes("Left click map while menu open")));
    assert.ok(lines.some((line) => line.includes("* 1. Housing (300)")));
});
