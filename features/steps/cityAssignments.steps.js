"use strict";

const assert = require("assert");
const { Given, When, Then, Before, After } = require("../localCucumber.js");

Before(async function () {
    this.joinResults = [];
    this.lastJoin = null;
});

After(async function () {
    await this.closeSockets();
    await this.stopServer();
});

Given(/^the BattleCity server is running$/, async function () {
    await this.startServer();
});

When(/^(\d+) players request to join city (\d+)$/, async function (count, cityId) {
    const targetCount = Number(count);
    const targetCity = Number(cityId);
    this.joinResults = [];
    for (let index = 0; index < targetCount; index += 1) {
        const result = await this.connectPlayer({ desiredCity: targetCity });
        this.joinResults.push(result);
    }
});

Then(/^the first player is assigned as the mayor for city (\d+)$/, function (cityId) {
    const targetCity = Number(cityId);
    const first = this.joinResults[0];
    assert(first, "Expected a first player assignment");
    assert.strictEqual(first.assignment.city, targetCity);
    assert.strictEqual(first.assignment.role, "mayor");
});

Then(/^the next (\d+) players are assigned as recruits for city (\d+)$/, function (recruitCount, cityId) {
    const targetCity = Number(cityId);
    const expectedCount = Number(recruitCount);
    const recruits = this.joinResults.slice(1, 1 + expectedCount);
    assert.strictEqual(recruits.length, expectedCount, "Did not capture the expected number of recruits");
    recruits.forEach((result, index) => {
        assert(result, `Missing recruit at index ${index}`);
        assert.strictEqual(result.assignment.city, targetCity);
        assert.strictEqual(result.assignment.role, "recruit");
    });
});

Then(/^player (\d+) is assigned to a different city$/, function (position) {
    const targetIndex = Number(position) - 1;
    const entry = this.joinResults[targetIndex];
    assert(entry, "Expected a player assignment to verify");
    const firstCity = this.joinResults[0].assignment.city;
    assert.notStrictEqual(entry.assignment.city, firstCity);
});

When(/^a player enters the game in city (\d+)$/, async function (cityId) {
    const targetCity = Number(cityId);
    this.lastJoin = await this.connectPlayer({ desiredCity: targetCity });
});

Then(/^the server places them at the shared spawn for city (\d+)$/, async function (cityId) {
    const targetCity = Number(cityId);
    const spawn = await this.loadCitySpawn(targetCity);
    const offset = this.lastJoin && this.lastJoin.player && this.lastJoin.player.offset;
    assert(offset, "Expected a player offset from the server");
    assert.strictEqual(offset.x, spawn.x);
    assert.strictEqual(offset.y, spawn.y);
});

Then(/^the client spawn helper resolves the same coordinates for city (\d+)$/, async function (cityId) {
    const targetCity = Number(cityId);
    const spawn = await this.loadCitySpawn(targetCity);
    const offset = this.lastJoin && this.lastJoin.player && this.lastJoin.player.offset;
    assert(offset, "Expected player offset data");
    assert.deepStrictEqual({ x: offset.x, y: offset.y }, { x: spawn.x, y: spawn.y });
});
