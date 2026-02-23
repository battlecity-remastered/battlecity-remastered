import test from "node:test";
import assert from "node:assert/strict";
import { createDirtyFlagTracker } from "../src/render/dirty-flags.js";

test("dirty flag tracker returns true only when signature changes", () => {
    const dirty = createDirtyFlagTracker();
    assert.equal(dirty.shouldRender("hud", "a"), true);
    assert.equal(dirty.shouldRender("hud", "a"), false);
    assert.equal(dirty.shouldRender("hud", "b"), true);
});

test("dirty flag tracker markDirty resets key cache", () => {
    const dirty = createDirtyFlagTracker();
    assert.equal(dirty.shouldRender("chat", "x"), true);
    assert.equal(dirty.shouldRender("chat", "x"), false);
    dirty.markDirty("chat");
    assert.equal(dirty.shouldRender("chat", "x"), true);
});
