import test from "node:test";
import assert from "node:assert/strict";
import { isRefreshDue } from "../src/render/pacing.js";

test("isRefreshDue returns true with no previous timestamp", () => {
    assert.equal(isRefreshDue(null, 1_000, 33), true);
});

test("isRefreshDue enforces interval from last refresh", () => {
    assert.equal(isRefreshDue(1_000, 1_020, 33), false);
    assert.equal(isRefreshDue(1_000, 1_033, 33), true);
    assert.equal(isRefreshDue(1_000, 1_050, 33), true);
});

test("isRefreshDue is permissive for invalid timing inputs", () => {
    assert.equal(isRefreshDue(1_000, Number.NaN, 33), true);
    assert.equal(isRefreshDue(1_000, 1_050, 0), true);
    assert.equal(isRefreshDue(1_000, 1_050, Number.NaN), true);
});
