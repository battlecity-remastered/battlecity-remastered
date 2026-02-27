import test from "node:test";
import assert from "node:assert/strict";
import { resolveDefenseDamageColumn } from "../src/render/parity/defense-damage.js";

test("resolveDefenseDamageColumn matches classic turret burn/damage thresholds", () => {
    assert.equal(resolveDefenseDamageColumn(9, 32, 32), 0);
    assert.equal(resolveDefenseDamageColumn(9, 20, 32), 1);
    assert.equal(resolveDefenseDamageColumn(9, 8, 32), 2);

    assert.equal(resolveDefenseDamageColumn(10, 16, 16), 0);
    assert.equal(resolveDefenseDamageColumn(10, 15, 16), 2);

    assert.equal(resolveDefenseDamageColumn(11, 30, 40), 0);
    assert.equal(resolveDefenseDamageColumn(11, 24, 40), 1);
    assert.equal(resolveDefenseDamageColumn(11, 20, 40), 2);
});

test("resolveDefenseDamageColumn falls back to pristine frame for invalid health metadata", () => {
    assert.equal(resolveDefenseDamageColumn(9, Number.NaN, 32), 0);
    assert.equal(resolveDefenseDamageColumn(9, 16, Number.NaN), 0);
    assert.equal(resolveDefenseDamageColumn(9, 16, 0), 0);
});
