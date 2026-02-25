import test from "node:test";
import assert from "node:assert/strict";
import {
    legacyDirectionToBulletHeading,
    normalizeLegacyDirection,
    resolveTankMuzzlePosition
} from "../src/gameplay/combat/shot-geometry.js";

test("normalizeLegacyDirection wraps and rounds to legacy 32-step headings", () => {
    assert.equal(normalizeLegacyDirection(0), 0);
    assert.equal(normalizeLegacyDirection(31.6), 0);
    assert.equal(normalizeLegacyDirection(-1), 31);
    assert.equal(normalizeLegacyDirection(24.4), 24);
});

test("legacyDirectionToBulletHeading maps cardinal legacy directions to bullet headings", () => {
    assert.equal(legacyDirectionToBulletHeading(0), 24); // up
    assert.equal(legacyDirectionToBulletHeading(8), 0); // right
    assert.equal(legacyDirectionToBulletHeading(16), 8); // down
    assert.equal(legacyDirectionToBulletHeading(24), 16); // left
});

test("resolveTankMuzzlePosition uses legacy sprite offsets", () => {
    const up = resolveTankMuzzlePosition(128, 128, 0);
    assert.ok(Math.abs(up.x - 152) < 0.001);
    assert.ok(Math.abs(up.y - 128.55) < 0.001);

    const left = resolveTankMuzzlePosition(128, 128, 24);
    assert.ok(Math.abs(left.x - 134.55) < 0.001);
    assert.ok(Math.abs(left.y - 152) < 0.001);
});
