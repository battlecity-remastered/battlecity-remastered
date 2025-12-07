"use strict";

const assert = require("assert");
const { Given, When, Then, Before, After } = require("../localCucumber.js");
const { ITEM_TYPES } = require("../../server/src/items.js");
const { POPULATION_MAX_NON_HOUSE } = require("../../server/src/constants.js");
const { setTimeout: delay } = require("timers/promises");

const ITEM_CONFIG = {
    turret: { itemType: ITEM_TYPES.TURRET, factoryType: 109, playerCap: 10, factoryCap: 10 },
    medkit: { itemType: ITEM_TYPES.MEDKIT, factoryType: 102, playerCap: 5, factoryCap: 20 },
    bomb: { itemType: ITEM_TYPES.BOMB, factoryType: 103, playerCap: 20, factoryCap: 20 },
    cloak: { itemType: ITEM_TYPES.CLOAK, factoryType: 100, playerCap: 4, factoryCap: 4 },
};

Before(async function (_scenario) {
    if (!_scenario || !_scenario.name.toLowerCase().includes("factory")) {
        return;
    }
    this.currentFactory = null;
    this.currentItem = null;
    this.currentItemLabel = null;
    await this.startServer();
    await this.ensureTestPlayer(0);
});

After(async function (_scenario) {
    if (!_scenario || !_scenario.name.toLowerCase().includes("factory")) {
        return;
    }
    await this.closeSockets();
    await this.stopServer();
});

Given(/^a connected player in city (\d+)$/, async function (cityId) {
    await this.ensureTestPlayer(Number(cityId));
});

Given(/^a (\w+) factory exists in city (\d+)$/, async function (itemLabel, cityId) {
    const entry = ITEM_CONFIG[itemLabel];
    assert(entry, `Unsupported item label: ${itemLabel}`);
    this.currentItem = entry;
    this.currentItemLabel = itemLabel;
    const numericCity = Number(cityId);
    await this.createBuilding({
        type: 300,
        x: 1,
        y: 1,
        cityId: numericCity,
        population: 0
    });
    await this.createBuilding({
        type: entry.factoryType + 300,
        x: 2,
        y: 2,
        cityId: numericCity,
        population: POPULATION_MAX_NON_HOUSE
    });
    const building = await this.createBuilding({
        type: entry.factoryType,
        x: 5,
        y: 5,
        cityId: numericCity,
        itemsLeft: entry.factoryCap,
        population: POPULATION_MAX_NON_HOUSE
    });
    assert(building && building.id, "Factory creation failed");
    this.currentFactory = building;
});

Given(/^a placed turret defense for city (\d+)$/, async function (cityId) {
    const player = await this.ensureTestPlayer(Number(cityId));
    await this.collectFactoryItem(this.currentFactory.id, {
        socketId: player.socketId,
        itemType: ITEM_CONFIG.turret.itemType,
        quantity: 1
    });
    const defense = await this.createDefense({
        type: ITEM_CONFIG.turret.itemType,
        cityId: Number(cityId),
        x: 0,
        y: 0,
        ownerId: player.socketId,
        consumeInventory: true
    });
    assert(defense && defense.id, "Failed to create turret defense");
    this.currentDefense = defense;
});

Given(/^the turret factory stock is (\d+)$/, async function (amount) {
    assert(this.currentFactory, "Factory not initialised");
    const target = Number(amount);
    const player = await this.ensureTestPlayer(0);
    await this.clearCityInventory(player.assignment.city, ITEM_CONFIG.turret.itemType);
    const updated = await this.setFactoryStock(this.currentFactory.id, target);
    assert(updated, "Factory missing");
});

When(/^that defense is destroyed$/, async function () {
    assert(this.currentDefense && this.currentDefense.id, "Defense not initialised");
    assert(this.currentFactory, "Factory not initialised");
    const before = await this.getBuilding(this.currentFactory.id);
    this.currentFactoryStockBefore = before?.itemsLeft || 0;
    const player = await this.ensureTestPlayer(0);
    this.replacementPromise = this.waitForIcon(ITEM_CONFIG.turret.itemType, this.currentFactory.id, {
        socketId: player.socketId,
        timeoutMs: 8000
    });
    await this.destroyDefense(this.currentDefense.id);
    await this.replacementPromise;
});

Then(/^the turret factory stock increases by (\d+)$/, async function (increment) {
    assert(this.currentFactory, "Factory not initialised");
    if (this.replacementPromise) {
        await this.replacementPromise;
    }
    const building = await this.getBuilding(this.currentFactory.id);
    assert(building, "Factory missing");
    const expected = Number(increment);
    const before = this.currentFactoryStockBefore ?? 0;
    assert.strictEqual(building.itemsLeft, before + expected, "Factory stock did not increase as expected after destruction");
});

Then(/^the factory stock for (\w+) is capped at (\d+)$/, async function (itemLabel, expectedCap) {
    assert(this.currentFactory, "Factory not initialised");
    assert.strictEqual(itemLabel, this.currentItemLabel, "Item label mismatch");
    const building = await this.getBuilding(this.currentFactory.id);
    assert(building, "Factory not found after production");
    assert.strictEqual(building.itemsLeft, Number(expectedCap), "Factory stock exceeded cap");
});

When(/^the player collects all available items from the factory$/, async function () {
    assert(this.currentFactory, "Factory not initialised");
    assert(this.currentItem, "Item config not set");
    const player = await this.ensureTestPlayer(0);
    await this.collectFactoryItem(this.currentFactory.id, {
        socketId: player.socketId,
        itemType: this.currentItem.itemType,
        quantity: 999
    });
});

Then(/^the player inventory for (\w+) is capped at (\d+)$/, async function (itemLabel, expectedCap) {
    assert.strictEqual(itemLabel, this.currentItemLabel, "Item label mismatch");
    const player = await this.ensureTestPlayer(0);
    const state = await this.loadPlayerState(player.socketId);
    const items = state?.inventory?.items || {};
    assert.strictEqual(items[itemLabel] || 0, Number(expectedCap), "Player inventory cap not enforced");
});

Then(/^the remaining factory stock for (\w+) is (\d+)$/, async function (_itemLabel, expectedRemaining) {
    assert(this.currentFactory, "Factory not initialised");
    const building = await this.getBuilding(this.currentFactory.id);
    assert(building, "Factory missing when checking remaining stock");
    assert.strictEqual(building.itemsLeft, Number(expectedRemaining), "Unexpected remaining factory stock");
});

When(/^a player collects all available items from the factory$/, async function () {
    assert(this.currentFactory, "Factory not initialised");
    assert(this.currentItem, "Item config not set");
    const player = await this.ensureTestPlayer(0);
    await this.collectFactoryItem(this.currentFactory.id, {
        socketId: player.socketId,
        itemType: this.currentItem.itemType,
        quantity: 999
    });
});

Then(/^the player places all the items$/, async function () {
    assert(this.currentItem, "Item config not set");
    const player = await this.ensureTestPlayer(0);
    const state = await this.loadPlayerState(player.socketId);
    const count = state?.inventory?.items?.[this.currentItemLabel] || 0;
    this.placedDefenses = [];
    for (let i = 0; i < count; i += 1) {
        const defense = await this.createDefense({
            type: this.currentItem.itemType,
            cityId: player.assignment.city,
            x: i * 10,
            y: 0,
            ownerId: player.socketId,
            consumeInventory: true
        });
        assert(defense && defense.id, "Failed to create defense");
        this.placedDefenses.push(defense);
    }
});

When(/^the player shoots an item to destroy it$/, async function () {
    assert(this.placedDefenses?.length, "No defenses placed");
    const first = this.placedDefenses.shift();
    assert(first?.id, "Missing defense id");
    const before = await this.getBuilding(this.currentFactory.id);
    this.currentFactoryStockBefore = before?.itemsLeft || 0;
    const type = this.currentItem?.itemType || ITEM_CONFIG.turret.itemType;
    const player = await this.ensureTestPlayer(0);
    this.replacementPromise = this.waitForIcon(type, this.currentFactory.id, {
        socketId: player.socketId,
        timeoutMs: 8000
    });
    await this.destroyDefense(first.id);
    await this.replacementPromise;
});

Then(/^the factory count should increment by one$/, async function () {
    if (this.replacementPromise) {
        await this.replacementPromise;
    }
    const after = await this.getBuilding(this.currentFactory.id);
    assert(after, "Factory missing");
    const before = this.currentFactoryStockBefore ?? 0;
    assert.strictEqual(after.itemsLeft, before + 1, "Factory stock did not increment after destruction");
});

When(/^all items are destroyed$/, async function () {
    assert(this.placedDefenses, "No defenses recorded");
    for (const defense of this.placedDefenses) {
        await this.destroyDefense(defense.id);
        // Small delay to allow factory stock replenishment to process
        await delay(100);
    }
});

Then(/^the factory count should equal the factory cap$/, async function () {
    assert(this.currentFactory, "Factory not initialised");
    // Factory production takes 7000ms per item, so we need much longer than 5s
    // to produce 10 items (worst case ~70+ seconds)
    const deadline = Date.now() + 90000;
    let building = null;
    while (Date.now() < deadline) {
        building = await this.getBuilding(this.currentFactory.id);
        if (building && building.itemsLeft === this.currentItem.factoryCap) {
            break;
        }
        await delay(500);
    }
    assert(building, "Factory missing");
    assert.strictEqual(building.itemsLeft, this.currentItem.factoryCap, "Factory stock did not replenish to cap");
});
