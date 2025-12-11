"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const { BOMB_EXPLOSION_TILE_RADIUS } = require("../src/gameplay/constants");

test("houses use 3x3 footprint for bomb destruction", () => {
    const game = { map: [] };
    const factory = new BuildingFactory(game);

    // House anchored at (10,10) should occupy tiles (10..12, 10..12)
    const house = { id: "house", x: 10, y: 10, type: 300 }; // house family code 3xx
    factory.buildings.set(house.id, house);

    const removed = [];
    factory.removeBuilding = (id) => {
        removed.push(id);
        factory.buildings.delete(id);
    };

    // Bomb with a 1-tile gap from the footprint (tile 13,8) should survive (Chebyshev distance 2)
    factory.destroyBuildingsInRadius(13, 8, BOMB_EXPLOSION_TILE_RADIUS, {
        excludeCommandCenters: true,
    });
    assert.ok(factory.buildings.has("house"), "house should survive a 1-tile gap");
    removed.length = 0;

    // Bomb touching the right edge (tile 13,10) is adjacent; should be destroyed
    factory.destroyBuildingsInRadius(13, 10, BOMB_EXPLOSION_TILE_RADIUS, {
        excludeCommandCenters: true,
    });
    assert.ok(!factory.buildings.has("house"), "house should be destroyed when bomb touches the 3x3 footprint");
    assert.deepEqual(new Set(removed), new Set(["house"]));
});
