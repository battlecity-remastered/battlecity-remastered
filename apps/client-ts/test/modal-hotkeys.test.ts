import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyModalToggle } from "../src/ui/modals/ModalHotkeys.js";

test("applyModalToggle toggles help/map and maps F3 to debug", () => {
    const state = createClientState();

    assert.equal(applyModalToggle(state, "F1"), true);
    assert.equal(state.ui.showHelpModal, true);
    assert.equal(state.ui.showMapModal, false);
    assert.equal(state.ui.showOptionsModal, false);

    assert.equal(applyModalToggle(state, "F2"), true);
    assert.equal(state.ui.showHelpModal, false);
    assert.equal(state.ui.showMapModal, true);
    assert.equal(state.ui.showOptionsModal, false);

    assert.equal(applyModalToggle(state, "m"), true);
    assert.equal(state.ui.showMapModal, false);

    assert.equal(applyModalToggle(state, "F3"), true);
    assert.equal(state.ui.showBotDebug, true);
    assert.equal(state.ui.showOptionsModal, false);
});

test("applyModalToggle routes option actions only while options modal is visible", () => {
    const state = createClientState();
    state.ui.showOptionsModal = false;
    assert.equal(applyModalToggle(state, "h"), false);
    assert.equal(state.ui.showHud, true);

    state.ui.showOptionsModal = true;
    assert.equal(applyModalToggle(state, "h"), true);
    assert.equal(state.ui.showHud, false);
});

test("applyModalToggle handles intro and tutorial controls", () => {
    const state = createClientState();
    state.ui.showIntroModal = true;
    assert.equal(applyModalToggle(state, "Enter"), true);
    assert.equal(state.ui.showIntroModal, false);

    assert.equal(applyModalToggle(state, "t"), true);
    assert.equal(state.ui.showTutorial, true);
});
