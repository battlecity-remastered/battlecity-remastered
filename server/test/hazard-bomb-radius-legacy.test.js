"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const HazardManager = require("../src/hazards/HazardManager");
const {
    TILE_SIZE,
    BOMB_EXPLOSION_TILE_RADIUS,
    BOMB_PLAYER_EXPLOSION_TILE_RADIUS,
} = require("../src/gameplay/constants");

const toPixels = (tile) => tile * TILE_SIZE;

test("bomb blast radius matches legacy behavior (buildings 2 tiles, players 1 tile)", () => {
    const game = {
        map: [],
        players: {
            near: { offset: { x: toPixels(10), y: toPixels(10) } },
            diagonal: { offset: { x: toPixels(11), y: toPixels(11) } },
            far: { offset: { x: toPixels(12), y: toPixels(10) } },
        },
        buildingFactory: {
            destroyBuildingsInRadius: (centerTileX, centerTileY, radius) => {
                game.buildingFactory.lastCall = { centerTileX, centerTileY, radius };
                return 0;
            },
        },
    };

    const damagedPlayers = [];
    const playerFactory = {
        getPlayerTeam: () => 2,
        applyDamage: (socketId) => damagedPlayers.push(socketId),
    };

    const defenseHits = [];
    const defenseManager = {
        defensesById: new Map([
            ["def_1", { id: "def_1", x: toPixels(11), y: toPixels(10) }],
        ]),
        applyDefenseDamage: (id, amount) => defenseHits.push({ id, amount }),
    };

    const hazardManager = new HazardManager(game, playerFactory);
    hazardManager.setDefenseManager(defenseManager);

    const bomb = {
        id: "bomb_legacy",
        type: "bomb",
        x: toPixels(10),
        y: toPixels(10),
        ownerId: "owner",
        teamId: 1,
        active: true,
        armed: true,
    };
    hazardManager.hazards.set(bomb.id, bomb);

    hazardManager.detonateBomb(bomb);

    assert.deepEqual(new Set(damagedPlayers), new Set(["near", "diagonal"]), "players within 1 tile (Chebyshev) should take damage");
    assert.ok(!damagedPlayers.includes("far"), "players outside the 1-tile radius should survive");
    assert.equal(defenseHits.length, 1, "defenses inside the 2-tile blast radius should be removed");
    assert.equal(game.buildingFactory.lastCall.radius, BOMB_EXPLOSION_TILE_RADIUS, "structures should use the building blast radius");
    assert.equal(BOMB_EXPLOSION_TILE_RADIUS, 1, "building blast radius should require touching the footprint");
    assert.equal(BOMB_PLAYER_EXPLOSION_TILE_RADIUS, 1, "legacy player blast radius should be 1 tile");
});
