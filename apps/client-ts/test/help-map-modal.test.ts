import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildHelpLines } from "../src/ui/help/HelpModal.js";
import { buildMapLines } from "../src/ui/map/MapModal.js";

test("buildHelpLines includes modal toggle controls", () => {
    const lines = buildHelpLines();
    assert.ok(lines.includes("F1: Toggle help"));
    assert.ok(lines.includes("F2: Toggle map"));
    assert.ok(lines.includes("F3: Toggle options"));
});

test("buildMapLines reflects state counts and assignments", () => {
    const state = createClientState();
    state.local.city = 3;
    state.local.id = "p1";
    state.lobby.assignments = [{ city: 3, mayorId: "p1", recruitCount: 2 }];

    const lines = buildMapLines(state);
    assert.equal(lines[0], "Map - City 3");
    assert.ok(lines.includes("Buildings: 0"));
    assert.ok(lines.includes("C3: mayor p1 r2"));
});
