"use strict";

const assert = require("assert");
const test = require("node:test");

const { WorldState } = require("../world");
const { TILE_SIZE, OB_PAD_PX } = require("../config");

const getObstacle = (world, id) => world.obstacles.find((o) => o.id === id);

test("house and research footprints stay 3x3 tiles", () => {
    const world = new WorldState({ log: () => {}, warn: () => {} });
    world.addBuilding({ id: "house", x: 10, y: 10, type: 300 });
    world.addBuilding({ id: "research", x: 12, y: 10, type: 401 });

    const expectedSize = (tiles) => (tiles * TILE_SIZE) + (OB_PAD_PX * 2);

    const house = getObstacle(world, "house");
    const research = getObstacle(world, "research");

    assert.ok(house, "house obstacle should be registered");
    assert.strictEqual(house.w, expectedSize(3));
    assert.strictEqual(house.h, expectedSize(3));

    assert.ok(research, "research obstacle should be registered");
    assert.strictEqual(research.w, expectedSize(3));
    assert.strictEqual(research.h, expectedSize(3));
});

test("factories, command centers, and hospitals use 3x2 blocking footprints", () => {
    const world = new WorldState({ log: () => {}, warn: () => {} });
    world.addBuilding({ id: "factory", x: 5, y: 5, type: 100 });
    world.addBuilding({ id: "command", x: 7, y: 5, type: 0 });
    world.addBuilding({ id: "hospital", x: 9, y: 5, type: 200 });

    const expectedWidth = (3 * TILE_SIZE) + (OB_PAD_PX * 2);
    const expectedHeight = (2 * TILE_SIZE) + (OB_PAD_PX * 2);

    const factory = getObstacle(world, "factory");
    const command = getObstacle(world, "command");
    const hospital = getObstacle(world, "hospital");

    assert.ok(factory, "factory obstacle should be registered");
    assert.strictEqual(factory.w, expectedWidth);
    assert.strictEqual(factory.h, expectedHeight);

    assert.ok(command, "command center obstacle should be registered");
    assert.strictEqual(command.w, expectedWidth);
    assert.strictEqual(command.h, expectedHeight);

    assert.ok(hospital, "hospital obstacle should be registered");
    assert.strictEqual(hospital.w, expectedWidth);
    assert.strictEqual(hospital.h, expectedHeight);
});

test("explicit width/height overrides type inference", () => {
    const world = new WorldState({ log: () => {}, warn: () => {} });
    world.addBuilding({ id: "custom", x: 3, y: 4, type: 999, width: 5, height: 1 });

    const expectedWidth = (5 * TILE_SIZE) + (OB_PAD_PX * 2);
    const expectedHeight = (1 * TILE_SIZE) + (OB_PAD_PX * 2);

    const custom = getObstacle(world, "custom");
    assert.ok(custom, "custom obstacle should be registered");
    assert.strictEqual(custom.w, expectedWidth);
    assert.strictEqual(custom.h, expectedHeight);
});
