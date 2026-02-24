import test from "node:test";
import assert from "node:assert/strict";
import {
    resolveBulletFrameRect,
    resolveHazardFrameRect,
    resolveHazardOffset,
    resolveHazardSortKey
} from "../src/render/items/item-parity-helpers.js";

test("hazard frame rectangles match mine/bomb/orb parity", () => {
    assert.deepEqual(resolveHazardFrameRect(4, 0, false), { x: 128, y: 0, width: 32, height: 32 });
    assert.deepEqual(resolveHazardFrameRect(3, 0, true), { x: 144, y: 91, width: 48, height: 48 });
    assert.deepEqual(resolveHazardFrameRect(5, 2, false), { x: 240, y: 138, width: 48, height: 48 });
});

test("hazard offsets and ordering match parity contract", () => {
    assert.deepEqual(resolveHazardOffset(4), { x: 8, y: 8 });
    assert.deepEqual(resolveHazardOffset(5), { x: 4, y: 0 });
    assert.deepEqual(resolveHazardOffset(3), { x: 0, y: 0 });

    assert.equal(resolveHazardSortKey(4) < resolveHazardSortKey(8), true);
});

test("bullet frame rect uses animated 8x8 row/column mapping", () => {
    assert.deepEqual(resolveBulletFrameRect(3, 2), { x: 24, y: 16, width: 8, height: 8 });
});
