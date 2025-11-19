"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const { POPULATION_MAX_NON_HOUSE } = require("../src/constants");
const { ITEM_TYPES } = require("../src/items");

test("cloak factory produces cloak icons when staffed", () => {
    const game = { tick: 0 };
    const factory = new BuildingFactory(game);
    const emitted = [];

    factory.io = {
        emit: (event, payload) => emitted.push({ event, payload }),
    };

    factory.spawnStaticBuilding({ id: "house", x: 0, y: 0, type: 300, city: 1 });
    const research = factory.spawnStaticBuilding({ id: "research", x: 1, y: 1, type: 400, city: 1 });
    const cloakFactory = factory.spawnStaticBuilding({ id: "cloak", x: 2, y: 2, type: 100, city: 1 });

    research.population = POPULATION_MAX_NON_HOUSE;
    cloakFactory.population = POPULATION_MAX_NON_HOUSE;

    game.tick = 8001;
    factory.cycle();

    const iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.ok(iconEvent, "expected cloak factory to emit a new icon");

    const iconPayload = JSON.parse(iconEvent.payload);
    assert.equal(iconPayload.type, ITEM_TYPES.CLOAK);
    assert.equal(iconPayload.cityId, 1);
    assert.equal(iconPayload.buildingId, cloakFactory.id);
    assert.equal(cloakFactory.itemsLeft, 1);
});
