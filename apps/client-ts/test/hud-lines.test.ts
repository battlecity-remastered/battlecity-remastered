import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildHudLines } from "../src/render/hud-lines.js";

test("buildHudLines omits diagnostic/debug lines by default", () => {
    const state = createClientState();
    const lines = buildHudLines(state);
    assert.equal(lines.some((line) => line.includes("Hostiles ")), false);
    assert.equal(lines.some((line) => line.includes("W/Up move")), false);
});

test("buildHudLines includes diagnostic/debug lines when bot debug is enabled", () => {
    const state = createClientState();
    state.ui.showBotDebug = true;
    const lines = buildHudLines(state);
    assert.equal(lines.some((line) => line.includes("Hostiles ")), true);
    assert.equal(lines.some((line) => line.includes("W/Up move")), true);
});
