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

test("factory stops producing when research is destroyed", () => {
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

    // First production cycle - should produce
    game.tick = 8001;
    factory.cycle();

    const firstIcon = emitted.find((entry) => entry.event === "new_icon");
    assert.ok(firstIcon, "expected first icon to be produced");
    assert.equal(cloakFactory.itemsLeft, 1);

    // Clear emitted events
    emitted.length = 0;

    // Destroy the research building
    factory.removeBuilding(research.id);

    // Second production cycle - should NOT produce
    game.tick = 16001;
    factory.cycle();

    const secondIcon = emitted.find((entry) => entry.event === "new_icon");
    assert.equal(secondIcon, undefined, "expected no icon after research destroyed");
    assert.equal(cloakFactory.itemsLeft, 1, "itemsLeft should remain unchanged");
});

test("factory resumes producing when research is rebuilt", () => {
    const game = { tick: 0 };
    const factory = new BuildingFactory(game);
    const emitted = [];

    factory.io = {
        emit: (event, payload) => emitted.push({ event, payload }),
    };

    factory.spawnStaticBuilding({ id: "house", x: 0, y: 0, type: 300, city: 1 });
    const cloakFactory = factory.spawnStaticBuilding({ id: "cloak", x: 2, y: 2, type: 100, city: 1 });

    cloakFactory.population = POPULATION_MAX_NON_HOUSE;

    // First cycle - no research, should NOT produce
    game.tick = 8001;
    factory.cycle();

    let iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.equal(iconEvent, undefined, "expected no icon without research");
    assert.equal(cloakFactory.itemsLeft, 0);

    // Add research building
    const research = factory.spawnStaticBuilding({ id: "research", x: 1, y: 1, type: 400, city: 1 });
    research.population = POPULATION_MAX_NON_HOUSE;

    // Clear emitted events
    emitted.length = 0;

    // Second cycle - with research, should produce
    game.tick = 16001;
    factory.cycle();

    iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.ok(iconEvent, "expected icon after research added");
    assert.equal(cloakFactory.itemsLeft, 1);
});

test("factory stops producing when research loses population", () => {
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

    // First cycle - should produce
    game.tick = 8001;
    factory.cycle();

    let iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.ok(iconEvent, "expected first icon");
    assert.equal(cloakFactory.itemsLeft, 1);

    // Clear emitted events
    emitted.length = 0;

    // Remove population from research
    research.population = 0;

    // Second cycle - should NOT produce
    game.tick = 16001;
    factory.cycle();

    iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.equal(iconEvent, undefined, "expected no icon after research loses population");
    assert.equal(cloakFactory.itemsLeft, 1);
});

test("different factory types check different research buildings", () => {
    const game = { tick: 0 };
    const factory = new BuildingFactory(game);
    const emitted = [];

    factory.io = {
        emit: (event, payload) => emitted.push({ event, payload }),
    };

    factory.spawnStaticBuilding({ id: "house", x: 0, y: 0, type: 300, city: 1 });
    // Add Laser Research (401) but NOT Cloak Research (400)
    const laserResearch = factory.spawnStaticBuilding({ id: "laser_research", x: 1, y: 1, type: 401, city: 1 });
    const cloakFactory = factory.spawnStaticBuilding({ id: "cloak", x: 2, y: 2, type: 100, city: 1 });

    laserResearch.population = POPULATION_MAX_NON_HOUSE;
    cloakFactory.population = POPULATION_MAX_NON_HOUSE;

    // First cycle - Cloak Factory needs Cloak Research (400), not Laser Research (401)
    game.tick = 8001;
    factory.cycle();

    let iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.equal(iconEvent, undefined, "Cloak Factory should not produce with only Laser Research");
    assert.equal(cloakFactory.itemsLeft, 0);

    // Add the correct research (Cloak Research 400)
    const cloakResearch = factory.spawnStaticBuilding({ id: "cloak_research", x: 3, y: 3, type: 400, city: 1 });
    cloakResearch.population = POPULATION_MAX_NON_HOUSE;

    // Clear emitted events
    emitted.length = 0;

    // Second cycle - now should produce
    game.tick = 16001;
    factory.cycle();

    iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.ok(iconEvent, "Cloak Factory should produce with Cloak Research");
    assert.equal(cloakFactory.itemsLeft, 1);
});

test("factory from different city does not use other city's research", () => {
    const game = { tick: 0 };
    const factory = new BuildingFactory(game);
    const emitted = [];

    factory.io = {
        emit: (event, payload) => emitted.push({ event, payload }),
    };

    // City 0 has research
    factory.spawnStaticBuilding({ id: "house0", x: 0, y: 0, type: 300, city: 0 });
    const city0Research = factory.spawnStaticBuilding({ id: "research0", x: 1, y: 1, type: 400, city: 0 });
    city0Research.population = POPULATION_MAX_NON_HOUSE;

    // City 1 has factory but NO research
    factory.spawnStaticBuilding({ id: "house1", x: 10, y: 10, type: 300, city: 1 });
    const city1Factory = factory.spawnStaticBuilding({ id: "cloak1", x: 11, y: 11, type: 100, city: 1 });
    city1Factory.population = POPULATION_MAX_NON_HOUSE;

    // Cycle - city 1 factory should NOT produce (wrong city)
    game.tick = 8001;
    factory.cycle();

    const iconEvent = emitted.find((entry) => entry.event === "new_icon");
    assert.equal(iconEvent, undefined, "City 1 factory should not use City 0's research");
    assert.equal(city1Factory.itemsLeft, 0);
});
