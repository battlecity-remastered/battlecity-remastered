"use strict";

const assert = require("assert");
const { Before, After, Given, When, Then } = require("../localCucumber.js");
const { ITEM_TYPES } = require("../../server/src/items.js");
const { POPULATION_MAX_NON_HOUSE, FACTORY_ITEM_LIMITS } = require("../../server/src/constants.js");

const TURRET_FACTORY_TYPE = 109;
const TURRET_RESEARCH_TYPE = 409;

Before(async function () {
    this.defenseContext = {
        friendly: null,
        enemy: null,
        factory: null,
        defenseId: null,
        stockBefore: null
    };
    await this.startServer();
});

After(async function () {
    await this.closeSockets();
    await this.stopServer();
});

Given(/^a mayor with a fully stocked turret factory$/, async function () {
    const player = await this.ensureTestPlayer(0);
    const limit = FACTORY_ITEM_LIMITS[TURRET_FACTORY_TYPE] || 10;
    const cityId = player.assignment?.city ?? 0;

    const house = await this.createBuilding({
        type: 300,
        x: 1,
        y: 1,
        cityId,
        population: 0
    });
    assert(house?.id, "Failed to create housing for attachments");

    const research = await this.createBuilding({
        type: TURRET_RESEARCH_TYPE,
        x: 0,
        y: 0,
        cityId,
        population: POPULATION_MAX_NON_HOUSE
    });
    assert(research?.id, "Failed to create research building");

    const factory = await this.createBuilding({
        type: TURRET_FACTORY_TYPE,
        x: 5,
        y: 5,
        cityId,
        itemsLeft: limit,
        population: POPULATION_MAX_NON_HOUSE
    });
    assert(factory?.id, "Failed to create turret factory");

    this.defenseContext.friendly = player;
    this.defenseContext.factory = factory;
    this.defenseContext.limit = limit;
});

Given(/^an enemy player in another city$/, async function () {
    const enemy = await this.connectPlayer({ desiredCity: 1 });
    assert(enemy?.socketId, "Failed to connect enemy player");
    this.defenseContext.enemy = enemy;
});

When(/^the mayor collects and places a turret$/, async function () {
    const ctx = this.defenseContext;
    assert(ctx?.friendly?.socketId, "Friendly player not initialised");
    assert(ctx?.factory?.id, "Factory not initialised");

    await this.collectFactoryItem(ctx.factory.id, {
        socketId: ctx.friendly.socketId,
        itemType: ITEM_TYPES.TURRET,
        quantity: 1
    });

    const building = await this.getBuilding(ctx.factory.id);
    ctx.stockBefore = building?.itemsLeft ?? null;

    const defenseId = `bdd_turret_${Date.now()}`;
    ctx.defenseId = defenseId;

    const socket = this.getSocketById(ctx.friendly.socketId);
    assert(socket, "Friendly socket missing");
    socket.emit("defense:spawn", JSON.stringify({
        id: defenseId,
        type: ITEM_TYPES.TURRET,
        cityId: ctx.friendly.assignment?.city ?? 0,
        teamId: ctx.friendly.assignment?.city ?? 0
    }));

    await this.waitForDefense(defenseId);
});

When(/^the mayor reports the turret destroyed$/, async function () {
    const ctx = this.defenseContext;
    assert(ctx?.defenseId, "No defense id recorded");
    ctx.replacement = this.waitForIcon(ITEM_TYPES.TURRET, ctx.factory.id, {
        socketId: ctx.friendly?.socketId
    });
    await this.destroyDefense(ctx.defenseId, {
        socketId: ctx.friendly?.socketId,
        reason: "destroyed"
    });
    await ctx.replacement;
});

When(/^the enemy reports the turret destroyed$/, async function () {
    const ctx = this.defenseContext;
    assert(ctx?.defenseId, "No defense id recorded");
    assert(ctx?.enemy?.socketId, "Enemy player not initialised");
    ctx.replacement = this.waitForIcon(ITEM_TYPES.TURRET, ctx.factory.id, {
        socketId: ctx.enemy.socketId
    });
    await this.destroyDefense(ctx.defenseId, {
        socketId: ctx.enemy.socketId,
        reason: "destroyed"
    });
    await ctx.replacement;
});

Then(/^the turret factory stock increases by one$/, async function () {
    const ctx = this.defenseContext;
    assert(ctx?.factory?.id, "Factory not initialised");
    const after = await this.getBuilding(ctx.factory.id);
    assert(after, "Factory missing after destruction");
    const before = Number(ctx.stockBefore ?? 0);
    assert.strictEqual(after.itemsLeft, before + 1, "Factory stock did not increase after destruction");
});
