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
    assert.equal(applyOptionsAction(state, "i"), true);
    assert.equal(state.ui.showIdentityPanel, true);
    assert.equal(applyOptionsAction(state, "p"), true);
    assert.equal(state.ui.showBotDebug, true);
    assert.equal(applyOptionsAction(state, "g"), true);
    assert.equal(state.identity.provider, "google");
    assert.equal(state.ui.showIdentityPanel, true);
    assert.equal(applyOptionsAction(state, "k"), true);
    assert.equal(state.ui.optionsPerformanceMode, "quality");
    assert.equal(applyOptionsAction(state, ","), true);
    assert.equal(state.ui.optionsCityImportCity, 7);
    assert.equal(applyOptionsAction(state, "."), true);
    assert.equal(state.ui.optionsCityImportCity, 0);
    assert.equal(applyOptionsAction(state, "v"), true);
    assert.equal(state.ui.optionsCityImportMode, "preview");
    assert.equal(state.ui.optionsCityImportStatus, "Previewing slot C0");
    assert.equal(applyOptionsAction(state, "y"), true);
    assert.equal(state.ui.optionsCityImportMode, "apply");
    assert.equal(state.ui.optionsCityImportStatus, "Applying import for C0...");

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
    state.ui.showIdentityPanel = true;
    state.ui.showBotDebug = true;
    state.identity.provider = "google";
    state.ui.optionsPerformanceMode = "quality";
    state.ui.optionsCityImportCity = 3;
    state.ui.optionsCityImportMode = "preview";
    state.ui.optionsCityImportStatus = "Imported C3: 12 buildings";
    state.ui.overlaysOpacity = 0.7;
    const lines = buildOptionsLines(state);
    assert.equal(lines[1], "HUD: off (press H)");
    assert.equal(lines[2], "Audio: off (press M)");
    assert.equal(lines[3], "Tutorial: on (press T)");
    assert.equal(lines[4], "Identity panel: on (press I/F6)");
    assert.equal(lines[5], "Identity provider: google (press G)");
    assert.equal(lines[6], "Bot debug: on (press P/F7)");
    assert.equal(lines[7], "Performance preset: quality (press K)");
    assert.equal(lines[8], "City import slot: C3 (press , or .)");
    assert.equal(lines[9], "City import mode: preview (press V/Y)");
    assert.equal(lines[10], "City import status: Imported C3: 12 buildings");
    assert.equal(lines[11], "Overlay opacity: 0.70 (press [ or ])");
});
