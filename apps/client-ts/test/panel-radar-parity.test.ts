import test from "node:test";
import assert from "node:assert/strict";
import {
    HOME_ARROW,
    PANEL_BOTTOM_Y,
    PANEL_FINANCE,
    PANEL_HEALTH,
    PANEL_INVENTORY_SLOTS,
    PANEL_MESSAGE,
    PANEL_TOP_Y,
    projectRadarPoint,
    RADAR_BOUNDS,
    RADAR_RANGE_PX,
    resolveHealthMaskRect,
    resolveHomeArrowFrame
} from "../src/render/panel/panel-visuals.js";

test("panel fixed coordinate contract is locked", () => {
    assert.equal(PANEL_TOP_Y, 0);
    assert.equal(PANEL_BOTTOM_Y, 430);
    assert.deepEqual(PANEL_FINANCE.moneyBox, { x: 2, y: 224 });
    assert.deepEqual(PANEL_FINANCE.incomeIcon, { x: 8, y: 225 });
    assert.deepEqual(PANEL_FINANCE.cashText, { x: 24, y: 226 });
    assert.deepEqual(PANEL_HEALTH, { x: 137, y: 160, width: 38, height: 87 });
    assert.deepEqual(PANEL_MESSAGE, { x: 12, y: 465, lineSpacing: 15 });
    assert.deepEqual(HOME_ARROW, { x: 5, y: 160, frameWidth: 40, frameHeight: 40, frameCount: 8 });
});

test("health mask formula uses bottom-up visibility", () => {
    assert.deepEqual(resolveHealthMaskRect(100, 100), { x: 137, y: 160, width: 38, height: 87 });
    assert.deepEqual(resolveHealthMaskRect(50, 100), { x: 137, y: 204, width: 38, height: 43 });
    assert.deepEqual(resolveHealthMaskRect(0, 100), { x: 137, y: 247, width: 38, height: 0 });
});

test("radar projection uses local-relative formula and clipping", () => {
    const panelStartX = 824;
    const myX = 1000;
    const myY = 1000;
    const inBounds = projectRadarPoint(panelStartX, myX, myY, myX + 70, myY + 69);
    assert.ok(inBounds);
    assert.deepEqual(inBounds, {
        x: 72,
        y: 72
    });

    const outOfRange = projectRadarPoint(panelStartX, myX, myY, myX + RADAR_RANGE_PX + 1, myY);
    assert.equal(outOfRange, null);

    const clippedOut = projectRadarPoint(panelStartX, myX, myY, myX + 2400, myY + 2400);
    assert.equal(clippedOut, null);

    assert.deepEqual(RADAR_BOUNDS, { offsetX: 28, offsetY: 8, width: 138, height: 138 });
});

test("inventory slot matrix and home-arrow frame quantization are stable", () => {
    assert.equal(PANEL_INVENTORY_SLOTS.length, 13);
    assert.deepEqual(PANEL_INVENTORY_SLOTS[0], { itemType: 12, x: 7, y: 267 });
    assert.deepEqual(PANEL_INVENTORY_SLOTS[3], { itemType: 3, x: 7, y: 302 });
    assert.deepEqual(PANEL_INVENTORY_SLOTS[12], { itemType: 0, x: 7, y: 372 });

    assert.equal(resolveHomeArrowFrame(0, 0, 1, 0), 0);
    assert.equal(resolveHomeArrowFrame(0, 0, 0, 1), 2);
    assert.equal(resolveHomeArrowFrame(0, 0, -1, 0), 4);
    assert.equal(resolveHomeArrowFrame(0, 0, 0, -1), 6);
});
