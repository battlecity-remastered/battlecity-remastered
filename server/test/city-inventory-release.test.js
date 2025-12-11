"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const { ITEM_TYPES } = require("../src/items");
const { ITEM_CAPS } = require("../../shared/itemCaps.cjs");

const CITY_ID = 1;

test("releasing player inventory keeps city mine counts for factory caps", () => {
    const game = {};
    const factory = new BuildingFactory(game);
    const cityManager = factory.cityManager;
    const socketId = "player_socket";

    const granted = cityManager.recordInventoryPickup(socketId, CITY_ID, ITEM_TYPES.MINE, ITEM_CAPS.MINE);
    assert.equal(granted, ITEM_CAPS.MINE);

    const outstandingBefore = factory.getCityOutstandingItemCount(CITY_ID, ITEM_TYPES.MINE);

    cityManager.releasePlayerInventory(socketId);

    const outstandingAfter = factory.getCityOutstandingItemCount(CITY_ID, ITEM_TYPES.MINE);
    assert.equal(outstandingAfter, outstandingBefore, "city stock should remain after player leaves");
    assert.equal(cityManager.getInventoryCount(CITY_ID, ITEM_TYPES.MINE), ITEM_CAPS.MINE);
});

test("clearing city inventory removes player-held items", () => {
    const game = {};
    const factory = new BuildingFactory(game);
    const cityManager = factory.cityManager;
    const socketId = "player_socket";

    cityManager.recordInventoryPickup(socketId, CITY_ID, ITEM_TYPES.MEDKIT, 2);
    const city = cityManager.ensureCity(CITY_ID);
    const updatedAtBefore = city.updatedAt;

    cityManager.clearCityInventory(CITY_ID);

    assert.equal(cityManager.getInventoryCount(CITY_ID, ITEM_TYPES.MEDKIT), 0);
    assert.equal(cityManager.getPlayerInventoryCount(socketId, ITEM_TYPES.MEDKIT), 0);
    assert(city.updatedAt > updatedAtBefore, "city updatedAt should advance when clearing inventory");
});

test("clearing a single type only removes matching inventory", () => {
    const game = {};
    const factory = new BuildingFactory(game);
    const cityManager = factory.cityManager;
    const socketId = "player_socket";

    cityManager.recordInventoryPickup(socketId, CITY_ID, ITEM_TYPES.MINE, 1);
    cityManager.recordInventoryPickup(socketId, CITY_ID, ITEM_TYPES.TURRET, 1);
    const city = cityManager.ensureCity(CITY_ID);
    const updatedAtBefore = city.updatedAt;

    cityManager.clearInventoryForType(CITY_ID, ITEM_TYPES.MINE);

    assert.equal(cityManager.getInventoryCount(CITY_ID, ITEM_TYPES.MINE), 0);
    assert.equal(cityManager.getInventoryCount(CITY_ID, ITEM_TYPES.TURRET), 1);
    assert.equal(cityManager.getPlayerInventoryCount(socketId, ITEM_TYPES.MINE), 0);
    assert.equal(cityManager.getPlayerInventoryCount(socketId, ITEM_TYPES.TURRET), 1);
    assert(city.updatedAt > updatedAtBefore, "city updatedAt should advance when clearing a type");
});
