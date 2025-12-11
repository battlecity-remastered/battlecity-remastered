"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const { BOMB_EXPLOSION_TILE_RADIUS } = require("../src/gameplay/constants");

test("bomb radius checks building origin (legacy behavior) and ignores footprint", () => {
    const game = { map: [] };
    const factory = new BuildingFactory(game);

    const farBuilding = { id: "far", x: 0, y: 0, type: 412 };
    const nearBuilding = { id: "near", x: 10, y: 10, type: 412 };
    const commandCenter = { id: "cc", x: 13, y: 10, type: 0 };

    factory.buildings.set(farBuilding.id, farBuilding);
    factory.buildings.set(nearBuilding.id, nearBuilding);
    factory.buildings.set(commandCenter.id, commandCenter);

    const removed = [];
    factory.removeBuilding = (id) => {
        removed.push(id);
        factory.buildings.delete(id);
    };

    // Blast centered on nearBuilding; footprint-aware radius 1
    factory.destroyBuildingsInRadius(nearBuilding.x, nearBuilding.y, BOMB_EXPLOSION_TILE_RADIUS, {
        excludeCommandCenters: true,
    });

    assert.ok(factory.buildings.has("far"), "building with a 1-tile gap should survive");
    assert.ok(!factory.buildings.has("near"), "building touching the blast footprint should be destroyed");
    assert.ok(factory.buildings.has("cc"), "command center should stay protected");
    assert.deepEqual(new Set(removed), new Set(["near"]), "only the touching building should be removed");
});
