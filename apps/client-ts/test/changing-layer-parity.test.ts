import test from "node:test";
import assert from "node:assert/strict";
import {
    resolveFactoryDigits,
    resolvePopulationFrame,
    resolvePopulationOffset,
    resolveResearchStripPlacement,
    resolveSmokeFrame,
    resolveSmokePlacement
} from "../src/render/layers/changing-layer-helpers.js";

test("population frame parity uses row and max-pop family rules", () => {
    assert.deepEqual(resolvePopulationFrame(200, 25), { row: 1, column: 3 });
    assert.deepEqual(resolvePopulationFrame(100, 25), { row: 0, column: 3 });
    assert.deepEqual(resolvePopulationFrame(400, 100), { row: 0, column: 6 });
});

test("population offsets parity matches family matrix", () => {
    assert.deepEqual(resolvePopulationOffset(200), { x: 96, y: 49 });
    assert.deepEqual(resolvePopulationOffset(100), { x: 96, y: 48 });
    assert.deepEqual(resolvePopulationOffset(300), { x: 96, y: 48 });
    assert.deepEqual(resolvePopulationOffset(400), { x: 96, y: 90 });
    assert.deepEqual(resolvePopulationOffset(201), { x: 96, y: 49 });
});

test("research strip parity uses crop and placement formulas", () => {
    assert.deepEqual(resolveResearchStripPlacement(95, 159), {
        sourceX: 0,
        sourceY: 5,
        sourceWidth: 10,
        sourceHeight: 134,
        x: (95 * 48) + 130,
        y: (159 * 48) + 6,
        width: 9,
        height: 121
    });
});

test("smoke and factory digits parity positions are fixed", () => {
    assert.equal(resolveSmokeFrame(0), 0);
    assert.equal(resolveSmokeFrame(120), 1);
    assert.deepEqual(resolveSmokePlacement(95, 159), {
        x: (95 * 48) + 6,
        y: (159 * 48) - 15,
        width: 180,
        height: 60
    });

    assert.deepEqual(resolveFactoryDigits(47), {
        tens: 4,
        ones: 7,
        tensOffset: { x: 56, y: 84 },
        onesOffset: { x: 72, y: 84 }
    });
});
