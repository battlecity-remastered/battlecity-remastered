import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    buildInventoryHudLines,
    cycleInventorySelection,
    onInventoryUpdate,
    toggleBombArming
} from "../src/gameplay/items/IconInventoryService.js";

test("inventory update picks first available item as selected", () => {
    const state = createClientState();
    state.inventory.set(3, 1);
    state.inventory.set(1, 2);

    onInventoryUpdate(state);

    assert.equal(state.ui.selectedInventoryItemType, 1);
    assert.equal(state.ui.bombArmed, false);
});

test("inventory selection cycles and resets bomb arming", () => {
    const state = createClientState();
    state.inventory.set(1, 2);
    state.inventory.set(4, 1);
    onInventoryUpdate(state);

    assert.equal(toggleBombArming(state), true);
    assert.equal(state.ui.bombArmed, true);

    cycleInventorySelection(state, 1);

    assert.equal(state.ui.selectedInventoryItemType, 4);
    assert.equal(state.ui.bombArmed, false);
});

test("inventory hud lines include selected marker and bomb status", () => {
    const state = createClientState();
    state.inventory.set(1, 3);
    onInventoryUpdate(state);
    toggleBombArming(state);

    const lines = buildInventoryHudLines(state);

    assert.equal(lines[0]?.includes("*Item 1: 3 (armed)"), true);
});
