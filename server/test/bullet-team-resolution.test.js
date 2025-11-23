"use strict";

const assert = require("node:assert/strict");
const { test } = require("node:test");

const BulletFactory = require("../src/BulletFactory");

const createFactory = () => {
    const socketId = "player-socket";
    const game = {
        map: [[0]],
        players: {
            [socketId]: {
                id: socketId,
                city: 1,
                offset: { x: 0, y: 0 }
            }
        }
    };
    const playerFactory = {
        getPlayerTeam: () => 1
    };
    return { bulletFactory: new BulletFactory(game, playerFactory), socketId };
};

test("structure-fired bullets keep provided team assignments", () => {
    const { bulletFactory, socketId } = createFactory();

    bulletFactory.handleRequestFire(
        { id: socketId },
        {
            x: 100,
            y: 100,
            angle: 0,
            type: 0,
            team: 7,
            sourceId: "turret-1",
            sourceType: "turret"
        }
    );

    assert.equal(bulletFactory.bullets.size, 1);
    const [bullet] = bulletFactory.bullets.values();
    assert.equal(bullet.teamId, 7);
    assert.equal(bullet.sourceType, "turret");
});
