"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");
const { TILE_SIZE } = require("../src/gameplay/constants");

const buildMap = (size = 8, fill = 0) => {
    const map = new Array(size);
    for (let x = 0; x < size; x += 1) {
        map[x] = new Array(size);
        for (let y = 0; y < size; y += 1) {
            map[x][y] = fill;
        }
    }
    return map;
};

const createFactory = ({ map, buildings } = {}) => {
    const game = {
        players: {},
        map: map || buildMap(),
        buildingFactory: {
            buildings: new Map(buildings || []),
            getBuildingFootprint() {
                return { width: 1, height: 1 };
            }
        }
    };
    const factory = new PlayerFactory(game);
    return { factory, game };
};

test("ensureSpawnIsClear returns original spawn when tile is open", () => {
    const { factory } = createFactory();
    const spawn = { x: 5 * TILE_SIZE, y: 6 * TILE_SIZE };

    const cleared = factory.ensureSpawnIsClear(spawn);

    assert.strictEqual(cleared, spawn);
});

test("ensureSpawnIsClear relocates spawn when a building blocks it", () => {
    const blockingTileX = 5;
    const blockingTileY = 5;
    const spawn = { x: blockingTileX * TILE_SIZE, y: blockingTileY * TILE_SIZE };

    const buildings = [
        [
            "blocking",
            {
                id: "blocking",
                type: 100,
                x: blockingTileX,
                y: blockingTileY
            }
        ]
    ];

    const { factory } = createFactory({ buildings });

    const cleared = factory.ensureSpawnIsClear(spawn);

    assert.notStrictEqual(cleared, spawn);
    assert.equal(cleared.x, spawn.x - TILE_SIZE);
    assert.equal(cleared.y, spawn.y - TILE_SIZE);
});

test("ensureSpawnIsClear searches outward until an open map tile is found", () => {
    const spawnTileX = 4;
    const spawnTileY = 4;
    const map = buildMap();

    const blockingValue = 1;
    const blockTile = (tileX, tileY) => {
        if (!map[tileX]) {
            map[tileX] = [];
        }
        map[tileX][tileY] = blockingValue;
    };

    blockTile(spawnTileX, spawnTileY); // original spawn
    blockTile(spawnTileX - 1, spawnTileY - 1);
    blockTile(spawnTileX, spawnTileY - 1);
    blockTile(spawnTileX + 1, spawnTileY - 1);
    blockTile(spawnTileX - 1, spawnTileY);
    blockTile(spawnTileX + 1, spawnTileY);
    blockTile(spawnTileX - 1, spawnTileY + 1);

    const { factory } = createFactory({ map });

    const spawn = { x: spawnTileX * TILE_SIZE, y: spawnTileY * TILE_SIZE };
    const cleared = factory.ensureSpawnIsClear(spawn);

    assert.notStrictEqual(cleared, spawn);
    assert.equal(cleared.x, spawn.x);
    assert.equal(cleared.y, spawn.y + TILE_SIZE);
});
