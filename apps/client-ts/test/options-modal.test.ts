import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyOptionsAction, buildOptionsLines } from "../src/ui/options/OptionsModal.js";

test("applyOptionsAction toggles HUD and clamps opacity range", () => {
    const state = createClientState();
    assert.equal(applyOptionsAction(state, "h"), true);
    assert.equal(state.ui.showHud, false);

    state.ui.overlaysOpacity = 0.25;
    assert.equal(applyOptionsAction(state, "["), true);
    assert.equal(state.ui.overlaysOpacity, 0.25);

    state.ui.overlaysOpacity = 1;
    assert.equal(applyOptionsAction(state, "]"), true);
    assert.equal(state.ui.overlaysOpacity, 1);
});

test("buildOptionsLines reflects current options state", () => {
    const state = createClientState();
    state.ui.showHud = false;
    state.ui.overlaysOpacity = 0.7;
    const lines = buildOptionsLines(state);
    assert.equal(lines[1], "HUD: off (press H)");
    assert.equal(lines[2], "Overlay opacity: 0.70 (press [ or ])");
});
