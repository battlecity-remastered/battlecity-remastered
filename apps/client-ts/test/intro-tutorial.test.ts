import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyIntroAction, buildIntroLines } from "../src/ui/intro/IntroModal.js";
import { applyTutorialToggle, buildTutorialLines } from "../src/ui/tutorial/TutorialManager.js";

test("intro actions close intro and toggle tutorial", () => {
    const state = createClientState();
    state.ui.showIntroModal = true;
    assert.equal(applyIntroAction(state, "Enter"), true);
    assert.equal(state.ui.showIntroModal, false);

    assert.equal(applyIntroAction(state, "t"), true);
    assert.equal(state.ui.showTutorial, true);
});

test("tutorial toggle hides intro and flips visibility", () => {
    const state = createClientState();
    state.ui.showIntroModal = true;
    assert.equal(applyTutorialToggle(state, "t"), true);
    assert.equal(state.ui.showTutorial, true);
    assert.equal(state.ui.showIntroModal, false);
});

test("intro/tutorial lines render expected control hints", () => {
    const state = createClientState();
    const intro = buildIntroLines(state).join("\n");
    const tutorial = buildTutorialLines(state).join("\n");
    assert.match(intro, /Enter: Start/);
    assert.match(tutorial, /Ctrl\+B/);
});
