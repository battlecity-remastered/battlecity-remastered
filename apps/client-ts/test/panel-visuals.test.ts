import test from "node:test";
import assert from "node:assert/strict";
import { isPanelButtonActive, resolveRadarColor } from "../src/render/panel/panel-visuals.js";

test("isPanelButtonActive maps subview and modal states to expected button indexes", () => {
    const base = {
        panelView: "status" as const,
        showMapModal: false,
        showHelpModal: false,
        showOptionsModal: false,
        showBuildMenu: false
    };

    assert.equal(isPanelButtonActive({ ...base, panelView: "staff" }, 0), true);
    assert.equal(isPanelButtonActive({ ...base, panelView: "city" }, 1), true);
    assert.equal(isPanelButtonActive({ ...base, panelView: "points" }, 2), true);
    assert.equal(isPanelButtonActive({ ...base, showMapModal: true }, 3), true);
    assert.equal(isPanelButtonActive({ ...base, showHelpModal: true }, 4), true);
    assert.equal(isPanelButtonActive({ ...base, showOptionsModal: true }, 5), true);
    assert.equal(isPanelButtonActive({ ...base, showBuildMenu: true }, 6), true);
    assert.equal(isPanelButtonActive(base, 7), false);
});

test("resolveRadarColor returns stable palette for radar entity kinds", () => {
    assert.equal(resolveRadarColor("self"), 0xffffff);
    assert.equal(resolveRadarColor("ally"), 0x8ad4ff);
    assert.equal(resolveRadarColor("enemy"), 0xffaa61);
    assert.equal(resolveRadarColor("building"), 0x56d27f);
});
