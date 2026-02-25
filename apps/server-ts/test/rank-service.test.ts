import test from "node:test";
import assert from "node:assert/strict";
import { resolveRankTitle } from "../src/domain/score/RankService.js";

test("rank ladder matches legacy thresholds", () => {
    assert.equal(resolveRankTitle(0), "Private");
    assert.equal(resolveRankTitle(99), "Private");
    assert.equal(resolveRankTitle(100), "Corporal");
    assert.equal(resolveRankTitle(499), "Sergeant");
    assert.equal(resolveRankTitle(500), "Sergeant Major");
    assert.equal(resolveRankTitle(32_000), "General");
    assert.equal(resolveRankTitle(700_000), "King");
});
