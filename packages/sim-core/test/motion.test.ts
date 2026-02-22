import test from "node:test";
import assert from "node:assert/strict";
import { advancePointByHeading32, heading32ToRadians, normalizeHeading32 } from "../src/index.js";

test("normalizeHeading32 wraps negatives and overflow", () => {
    assert.equal(normalizeHeading32(0), 0);
    assert.equal(normalizeHeading32(33), 1);
    assert.equal(normalizeHeading32(-1), 31);
    assert.equal(normalizeHeading32(-33), 31);
});

test("heading32ToRadians maps heading buckets to radians", () => {
    assert.equal(heading32ToRadians(0), 0);
    assert.equal(heading32ToRadians(8), Math.PI / 2);
    assert.equal(heading32ToRadians(16), Math.PI);
});

test("advancePointByHeading32 applies speed and dt in heading direction", () => {
    const next = advancePointByHeading32(100, 200, 0, 300, 100);
    assert.equal(next.y, 200);
    assert.equal(next.x, 130);
});
