import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { resolveDebugLocalLineTarget } from "../src/render/debug/BotDebugLayer.js";

test("resolveDebugLocalLineTarget maps tank top-left coordinates to sprite center", () => {
    const state = createClientState();
    state.local.x = 100;
    state.local.y = 250;

    assert.deepEqual(resolveDebugLocalLineTarget(state), { x: 124, y: 274 });
});

test("resolveDebugLocalLineTarget can use smoothed render position", () => {
    const state = createClientState();
    state.local.x = 100;
    state.local.y = 250;

    assert.deepEqual(resolveDebugLocalLineTarget(state, 112.5, 260.5), { x: 136.5, y: 284.5 });
});
