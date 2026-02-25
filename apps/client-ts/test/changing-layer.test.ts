import test from "node:test";
import assert from "node:assert/strict";
import { isCommandCenterType, isFactoryType, resolveSmokeFrame } from "../src/render/layers/changing-layer-helpers.js";

test("isCommandCenterType matches legacy command center ids", () => {
    assert.equal(isCommandCenterType(0), true);
    assert.equal(isCommandCenterType(200), true);
    assert.equal(isCommandCenterType(201), true);
    assert.equal(isCommandCenterType(109), false);
});

test("isFactoryType matches factory family ids", () => {
    assert.equal(isFactoryType(100), true);
    assert.equal(isFactoryType(101), true);
    assert.equal(isFactoryType(102), true);
    assert.equal(isFactoryType(112), true);
    assert.equal(isFactoryType(300), false);
});

test("resolveSmokeFrame uses deterministic frame windows", () => {
    assert.equal(resolveSmokeFrame(0), 0);
    assert.equal(resolveSmokeFrame(119), 0);
    assert.equal(resolveSmokeFrame(120), 1);
    assert.equal(resolveSmokeFrame(960), 0);
});
