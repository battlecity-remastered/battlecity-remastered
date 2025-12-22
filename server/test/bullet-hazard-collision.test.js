"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const BulletFactory = require("../src/BulletFactory");

const TILE_SIZE = 48;

describe("BulletFactory hazard collisions", () => {
    it("removes hazards (e.g. mines) when struck by a bullet", () => {
        const hazards = new Map();
        hazards.set("mine_1", {
            id: "mine_1",
            type: "mine",
            x: 5 * TILE_SIZE,
            y: 7 * TILE_SIZE,
            active: true,
            armed: true,
        });

        const hazardManager = {
            hazards,
            removeHazard(id, reason) {
                hazardManager.lastRemoval = { id, reason };
                hazards.delete(id);
            },
            lastRemoval: null,
        };

        const game = {
            map: [[0]],
            players: {},
            buildingFactory: {
                buildings: new Map(),
            },
        };
        const playerFactory = {
            getPlayerTeam: () => null,
            applyDamage: () => { },
        };

        const bulletFactory = new BulletFactory(game, playerFactory);
        bulletFactory.setHazardManager(hazardManager);

        const bullet = {
            id: "bullet_test",
            x: (5 * TILE_SIZE) + 10,
            y: (7 * TILE_SIZE) + 10,
            lifeMs: 0,
            lastUpdateAt: 0,
            velocityXPerMs: 0,
            velocityYPerMs: 0,
            maxVelocityPerMs: 0,
            traveled: 0,
            maxRange: 9999,
        };

        bulletFactory.updateBullet(bullet, 16, Date.now());

        assert.equal(hazards.has("mine_1"), false);
        assert.deepEqual(hazardManager.lastRemoval, { id: "mine_1", reason: "bullet_hit" });
        assert.equal(bullet._destroy, true);
    });
});

