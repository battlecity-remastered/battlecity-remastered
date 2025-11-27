"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const DefenseManager = require("../src/DefenseManager");
const { TILE_SIZE } = require("../src/gameplay/constants");

const createManager = (options = {}) => {
    const game = options.game || { buildingFactory: { buildings: new Map() } };
    const playerFactory = options.playerFactory || {
        getPlayer() {
            return null;
        }
    };
    const hazardManager = options.hazardManager || null;
    return new DefenseManager({ game, playerFactory, hazardManager });
};

test("getPlayerDominantTile picks the tile containing the player when not straddling", () => {
    const manager = createManager();
    const tile = manager.getPlayerDominantTile({
        offset: { x: TILE_SIZE * 4, y: TILE_SIZE * 7 }
    });
    assert.deepEqual(tile, { x: 4, y: 7 });
});

test("resolvePlacementForPlayer nudges to the nearest free tile when preferred is blocked by a building", () => {
    const buildings = new Map();
    buildings.set("building_1", { x: 4, y: 7 }); // occupies tiles (4..6, 7..9)
    const manager = createManager({
        game: { buildingFactory: { buildings } }
    });

    const placement = manager.resolvePlacementForPlayer({
        offset: { x: TILE_SIZE * 4, y: TILE_SIZE * 7 }
    });

    assert.equal(placement.tileY, 7);
    assert.equal(placement.tileX, 3, "nearest free tile should shift left off the footprint");
    assert.equal(placement.adjusted, true);
});

test("resolvePlacementForPlayer skips hazards while searching for a free tile", () => {
    const buildings = new Map();
    buildings.set("building_1", { x: 4, y: 7 });

    const hazardManager = {
        hazards: new Map([
            ["hazard_1", { x: TILE_SIZE * 3, y: TILE_SIZE * 7 }]
        ])
    };

    const manager = createManager({
        game: { buildingFactory: { buildings } },
        hazardManager
    });

    const placement = manager.resolvePlacementForPlayer({
        offset: { x: TILE_SIZE * 4, y: TILE_SIZE * 7 }
    });

    assert.deepEqual(placement.preferred, { x: 4, y: 7 });
    assert.equal(placement.tileX, 4);
    assert.equal(placement.tileY, 6, "should move vertically when lateral neighbors are blocked");
    assert.equal(placement.adjusted, true);
});
