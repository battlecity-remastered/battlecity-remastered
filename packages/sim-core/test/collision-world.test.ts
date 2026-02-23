import test from "node:test";
import assert from "node:assert/strict";
import {
    collidesAt,
    findNearestSafePoint,
    tileToRect,
    type CollisionWorld
} from "../src/index.js";

test("collidesAt returns true when candidate intersects blocking tile", () => {
    const world: CollisionWorld = {
        maxX: 512,
        maxY: 512,
        blocks: [tileToRect(2, 2, 48)]
    };

    assert.equal(collidesAt(world, { x: 110, y: 110 }, 12), true);
    assert.equal(collidesAt(world, { x: 40, y: 40 }, 12), false);
});

test("findNearestSafePoint returns nearest unclipped edge candidate", () => {
    const world: CollisionWorld = {
        maxX: 256,
        maxY: 256,
        blocks: [tileToRect(1, 1, 48)]
    };

    const safe = findNearestSafePoint(world, { x: 72, y: 72 }, 12, 8, 64);
    assert.notEqual(safe, null);
    assert.equal(collidesAt(world, safe!, 12), false);
});
