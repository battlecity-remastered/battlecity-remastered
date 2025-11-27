"use strict";

import test from "node:test";
import assert from "node:assert/strict";

import ItemFactory from "../src/factories/ItemFactory.js";
import {
    ITEM_TYPE_WALL,
} from "../src/constants.js";

const createFactory = (gameOverrides = {}) => {
    const baseGame = {
        player: {
            id: "player_1",
            city: 1,
            offset: { x: 0, y: 0 },
        },
        forceDraw: false,
    };
    const game = Object.assign(baseGame, gameOverrides);
    return new ItemFactory(game);
};

test("defense drops snap to the player's dominant tile when notifying server", () => {
    const socketStub = {
        spawnDefense() { /* no-op */ },
        on() { /* no-op */ },
        off() { /* no-op */ },
    };
    const factory = createFactory({
        player: {
            id: "player_1",
            city: 1,
            offset: { x: 60, y: 60 }, // inside tile (1,1) since TILE_SIZE=48
        },
        socketListener: socketStub,
    });

    const item = factory.newItem(null, 10, 10, ITEM_TYPE_WALL);
    assert.ok(item, "expected wall item to be created");
    assert.equal(item.x, 48);
    assert.equal(item.y, 48);
});

test("defense snapshot creations keep provided coordinates (no snap when notifyServer=false)", () => {
    const factory = createFactory({
        player: {
            id: "player_1",
            city: 1,
            offset: { x: 300, y: 300 },
        },
    });

    const item = factory.newItem(null, 200, 310, ITEM_TYPE_WALL, { notifyServer: false });
    assert.ok(item, "expected wall item to be created");
    assert.equal(item.x, 200);
    assert.equal(item.y, 310);
});
