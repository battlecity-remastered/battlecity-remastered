import test from "node:test";
import assert from "node:assert/strict";
import {
    direction32ToBulletHeading,
    normalizeDirection32,
    resolveTankMuzzlePosition
} from "../src/gameplay/combat/shot-geometry.js";

test("normalizeDirection32 wraps and rounds to classic 32-step headings", () => {
    assert.equal(normalizeDirection32(0), 0);
    assert.equal(normalizeDirection32(31.6), 0);
    assert.equal(normalizeDirection32(-1), 31);
    assert.equal(normalizeDirection32(24.4), 24);
});

test("direction32ToBulletHeading maps cardinal classic directions to bullet headings", () => {
    assert.equal(direction32ToBulletHeading(0), 24); // up
    assert.equal(direction32ToBulletHeading(8), 0); // right
    assert.equal(direction32ToBulletHeading(16), 8); // down
    assert.equal(direction32ToBulletHeading(24), 16); // left
});

test("resolveTankMuzzlePosition uses classic sprite offsets", () => {
    const up = resolveTankMuzzlePosition(128, 128, 0);
    assert.ok(Math.abs(up.x - 152) < 0.001);
    assert.ok(Math.abs(up.y - 128.55) < 0.001);

    const left = resolveTankMuzzlePosition(128, 128, 24);
    assert.ok(Math.abs(left.x - 134.55) < 0.001);
    assert.ok(Math.abs(left.y - 152) < 0.001);
});
