"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const CityManager = require("../src/CityManager");
const { ITEM_TYPES } = require("../src/items");

test("medkit inventory decrements and allows replenishment up to cap", () => {
    const cm = new CityManager({});
    const socketId = "player1";
    const cityId = 1;

    const cap = cm.getInventoryCap(ITEM_TYPES.MEDKIT);
    assert.ok(cap >= 1, "expected medkit cap to be at least 1");

    const picked = cm.recordInventoryPickup(socketId, cityId, ITEM_TYPES.MEDKIT, cap);
    assert.equal(picked, cap, "initial pickup should fill to cap");
    assert.equal(cm.getPlayerInventoryCount(socketId, ITEM_TYPES.MEDKIT), cap);

    const consumed = cm.recordInventoryConsumption(socketId, cityId, ITEM_TYPES.MEDKIT, 2);
    assert.equal(consumed, 2, "should consume requested medkits");
    const remaining = cm.getPlayerInventoryCount(socketId, ITEM_TYPES.MEDKIT);
    assert.equal(remaining, cap - 2, "player inventory should reflect consumption");

    const refill = cm.recordInventoryPickup(socketId, cityId, ITEM_TYPES.MEDKIT, 2);
    assert.equal(refill, 2, "should allow refilling used medkits");
    assert.equal(cm.getPlayerInventoryCount(socketId, ITEM_TYPES.MEDKIT), cap, "should return to cap after refill");
});
