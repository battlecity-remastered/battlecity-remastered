"use strict";

const assert = require("assert");
const { Before, After, Given, When, Then } = require("../localCucumber.js");
const { ITEM_TYPES } = require("../../server/src/items.js");

Before(async function (scenario) {
    if (!scenario || !(scenario.tags || []).includes("medkit")) {
        return;
    }
    this.testPlayer = null;
    this.medkitScenarioTags = scenario.tags || [];
    if (this.socketById && typeof this.socketById.clear === "function") {
        this.socketById.clear();
    }
    this.medkitContext = {
        socketId: null,
        maxHealth: null,
        beforeHealth: null,
        afterHealth: null
    };
    await this.startServer();
});

After(async function (scenario) {
    if (!scenario || !(scenario.tags || []).includes("medkit")) {
        return;
    }
    await this.closeSockets();
    await this.stopServer();
});

Given(/^a player is below maximum health$/, async function () {
    const join = await this.ensureTestPlayer(0);
    const constants = await this.loadServerConstants();
    const maxHealth = Number(constants?.maxHealth || 0);
    assert(Number.isFinite(maxHealth) && maxHealth > 0, "Max health unavailable");
    const targetHealth = Math.max(1, Math.floor(maxHealth / 2));
    await this.setPlayerHealth(join.socketId, targetHealth);
    this.medkitContext.socketId = join.socketId;
    this.medkitContext.maxHealth = maxHealth;
    this.medkitContext.beforeHealth = targetHealth;
});

Given(/^the player has a medkit in their inventory$/, async function () {
    assert(this.medkitContext?.socketId, "Player not initialised");
    const granted = await this.grantPlayerItem(this.medkitContext.socketId, ITEM_TYPES.MEDKIT, 1);
    assert(granted && granted.count >= 1, "Failed to grant medkit to player");
});

Given(/^the server forgets the player's medkit inventory$/, async function () {
    if (!this.medkitContext?.socketId) {
        const join = await this.ensureTestPlayer(0);
        const constants = await this.loadServerConstants();
        const maxHealth = Number(constants?.maxHealth || 0);
        const targetHealth = Math.max(1, Math.floor(maxHealth / 2));
        await this.setPlayerHealth(join.socketId, targetHealth);
        this.medkitContext.socketId = join.socketId;
        this.medkitContext.maxHealth = maxHealth;
        this.medkitContext.beforeHealth = targetHealth;
    }
    const state = await this.loadPlayerState(this.medkitContext.socketId);
    const cityId = state?.cityId ?? state?.player?.city ?? 0;
    await this.clearCityInventory(cityId, ITEM_TYPES.MEDKIT);
});

When(/^the player consumes the medkit$/, async function () {
    assert(this.medkitContext?.socketId, "Player not initialised");
    const socket = this.getSocketById(this.medkitContext.socketId);
    assert(socket, "Player socket not found");
    const wait = this.waitForHealthUpdate(this.medkitContext.socketId, 2000);
    socket.emit("item:use", JSON.stringify({ type: "medkit" }));
    try {
        const update = await wait;
        this.medkitContext.afterHealth = update?.health ?? null;
    } catch (_error) {
        this.medkitContext.afterHealth = null;
    }
});

Then(/^the player regains the expected health every time and the medkit does not disappear without healing$/, async function () {
    assert(this.medkitContext, "Medkit context missing");
    const after = Number(this.medkitContext.afterHealth);
    assert.strictEqual(after, this.medkitContext.maxHealth, "Health was not fully restored by medkit");
    const state = await this.loadPlayerState(this.medkitContext.socketId);
    const medkitCount = state?.inventory?.items?.medkit || 0;
    assert.strictEqual(medkitCount, 0, "Medkit was not consumed from inventory");
});

Then(/^the medkit use is rejected and the player keeps the medkit$/, async function () {
    assert(this.medkitContext, "Medkit context missing");
    const state = await this.loadPlayerState(this.medkitContext.socketId);
    const medkitCount = state?.inventory?.items?.medkit || 0;
    const after = Number(this.medkitContext.afterHealth);
    // Health should remain at the pre-use level (waiter may time out)
    assert.strictEqual(after || this.medkitContext.beforeHealth, this.medkitContext.beforeHealth, "Health should remain unchanged when medkit is rejected");
    assert.strictEqual(medkitCount, 1, "Medkit should remain in inventory when use is rejected");
});
