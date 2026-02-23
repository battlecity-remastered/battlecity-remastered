import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyOptionsAction, buildOptionsLines } from "../src/ui/options/OptionsModal.js";

test("applyOptionsAction toggles HUD and clamps opacity range", () => {
    const state = createClientState();
    assert.equal(applyOptionsAction(state, "h"), true);
    assert.equal(state.ui.showHud, false);
    assert.equal(applyOptionsAction(state, "m"), true);
    assert.equal(state.ui.audioEnabled, false);
    assert.equal(applyOptionsAction(state, "t"), true);
    assert.equal(state.ui.showTutorial, true);

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
    state.ui.audioEnabled = false;
    state.ui.showTutorial = true;
    state.ui.overlaysOpacity = 0.7;
    const lines = buildOptionsLines(state);
    assert.equal(lines[1], "HUD: off (press H)");
    assert.equal(lines[2], "Audio: off (press M)");
    assert.equal(lines[3], "Tutorial: on (press T)");
    assert.equal(lines[4], "Overlay opacity: 0.70 (press [ or ])");
});
