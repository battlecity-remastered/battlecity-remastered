"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const Building = require("../src/Building");

const createBuilding = (id, type) => new Building("owner", {
    id,
    x: 0,
    y: 0,
    type,
    city: 0,
});

test("houses fill existing attachment slots before using empty houses", () => {
    const factory = new BuildingFactory({ tick: Date.now(), players: {}, cities: [] });

    const houseA = createBuilding("houseA", 300);
    const houseB = createBuilding("houseB", 300);
    factory.buildings.set(houseA.id, houseA);
    factory.buildings.set(houseB.id, houseB);

    const factory1 = createBuilding("factory1", 100);
    factory.buildings.set(factory1.id, factory1);
    assert.equal(factory.ensureAttachment(factory1).id, houseA.id);
    assert.equal(houseA.attachments.length, 1);

    const factory2 = createBuilding("factory2", 100);
    factory.buildings.set(factory2.id, factory2);
    assert.equal(factory.ensureAttachment(factory2).id, houseA.id, "should use partially filled house first");
    assert.equal(houseA.attachments.length, 2, "house should reach its second slot before moving on");

    const factory3 = createBuilding("factory3", 100);
    factory.buildings.set(factory3.id, factory3);
    assert.equal(factory.ensureAttachment(factory3).id, houseB.id, "moves to next house once current is full");
    assert.equal(houseB.attachments.length, 1);
});
