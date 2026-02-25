import test from "node:test";
import assert from "node:assert/strict";
import {
    isWorldPointVisible,
    isWorldRectVisible,
    resolveWorldViewBounds
} from "../src/render/world-bounds.js";

test("resolveWorldViewBounds includes overscan on all sides", () => {
    const bounds = resolveWorldViewBounds(500, 400, 300, 200, 24);
    assert.deepEqual(bounds, {
        left: 326,
        top: 276,
        right: 674,
        bottom: 524
    });
});

test("isWorldRectVisible checks rectangle intersection", () => {
    const bounds = resolveWorldViewBounds(500, 400, 300, 200, 0);
    assert.equal(isWorldRectVisible(bounds, 450, 380, 64, 64), true);
    assert.equal(isWorldRectVisible(bounds, 900, 900, 64, 64), false);
});

test("isWorldPointVisible supports padded visibility", () => {
    const bounds = resolveWorldViewBounds(500, 400, 300, 200, 0);
    assert.equal(isWorldPointVisible(bounds, 651, 400), false);
    assert.equal(isWorldPointVisible(bounds, 651, 400, 2), true);
});
