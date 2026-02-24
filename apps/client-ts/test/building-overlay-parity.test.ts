import test from "node:test";
import assert from "node:assert/strict";
import {
    BUILDING_ANIM_DIVISOR,
    BUILDING_ANIM_START_X,
    FACTORY_OVERLAY_OFFSET,
    RESEARCH_OVERLAY_OFFSET,
    resolveBuildingAnimationFrameX,
    resolveBuildingBaseFrame,
    resolveBuildingOverlay,
    resolveCommandCenterLabelPosition
} from "../src/render/layers/building-parity-helpers.js";

test("building base frame uses parity row contract", () => {
    assert.deepEqual(resolveBuildingBaseFrame(100), { x: 0, y: 144, width: 144, height: 144 });
    assert.deepEqual(resolveBuildingBaseFrame(200), { x: 0, y: 288, width: 144, height: 144 });
    assert.deepEqual(resolveBuildingBaseFrame(500), { x: 0, y: 720, width: 144, height: 144 });
});

test("building animation x follows parity strip cadence", () => {
    assert.equal(resolveBuildingAnimationFrameX(0), BUILDING_ANIM_START_X);
    assert.equal(resolveBuildingAnimationFrameX(BUILDING_ANIM_DIVISOR), BUILDING_ANIM_START_X + 144);
    assert.equal(resolveBuildingAnimationFrameX(BUILDING_ANIM_DIVISOR * 2), BUILDING_ANIM_START_X + 288);
    assert.equal(resolveBuildingAnimationFrameX(BUILDING_ANIM_DIVISOR * 3), BUILDING_ANIM_START_X);
});

test("building overlays use parity offsets for factory and research", () => {
    assert.deepEqual(resolveBuildingOverlay(100), { iconIndex: 1, offset: FACTORY_OVERLAY_OFFSET });
    assert.deepEqual(resolveBuildingOverlay(200), { iconIndex: 2, offset: RESEARCH_OVERLAY_OFFSET });
    assert.equal(resolveBuildingOverlay(300), null);
});

test("command center label position uses tile-center and y offset parity", () => {
    assert.deepEqual(resolveCommandCenterLabelPosition(95, 159), {
        x: (96.5 * 48),
        y: (160.5 * 48) - 32
    });
});
