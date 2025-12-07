"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const CityManager = require("../src/CityManager");
const IconDropManager = require("../src/IconDropManager");
const { ITEM_TYPES } = require("../src/items");

const createSocket = (id) => {
    const emitted = [];
    return {
        id,
        emitted,
        emit(event, payload) {
            emitted.push({ event, payload });
        }
    };
};

test("medkit pickup -> use -> pickup stays in sync", () => {
    const game = { players: {} };
    const cityManager = new CityManager(game);
    const playerFactory = {
        getPlayer: (socketId) => game.players[socketId] || null
    };
    const dropManager = new IconDropManager({
        cityManager,
        playerFactory,
        allowedTypes: new Set([ITEM_TYPES.MEDKIT])
    });
    dropManager.setIo({ emit: () => {} });

    const socket = createSocket("sock1");
    const player = { id: socket.id, city: 1, health: 10 };
    game.players[socket.id] = player;
    cityManager.ensureCity(1);

    // First medkit pickup
    const icon1 = dropManager.createIconRecord({
        id: "med1",
        type: ITEM_TYPES.MEDKIT,
        x: 0,
        y: 0,
        cityId: 1,
        teamId: 1,
        quantity: 1
    });
    dropManager.droppedIcons.set(icon1.id, icon1);
    dropManager.handlePickup(socket, { id: icon1.id });
    assert.equal(cityManager.getPlayerInventoryCount(socket.id, ITEM_TYPES.MEDKIT), 1, "player receives medkit");

    // Use the medkit (consumption succeeds)
    const consumed = cityManager.recordInventoryConsumption(socket.id, 1, ITEM_TYPES.MEDKIT, 1);
    assert.equal(consumed, 1, "medkit consumption should succeed");
    assert.equal(cityManager.getPlayerInventoryCount(socket.id, ITEM_TYPES.MEDKIT), 0, "player inventory updated after use");

    // Second pickup should succeed, not rejected as inventory_full
    const icon2 = dropManager.createIconRecord({
        id: "med2",
        type: ITEM_TYPES.MEDKIT,
        x: 5,
        y: 5,
        cityId: 1,
        teamId: 1,
        quantity: 1
    });
    dropManager.droppedIcons.set(icon2.id, icon2);
    dropManager.handlePickup(socket, { id: icon2.id });

    const rejection = socket.emitted.find((e) => e.event === "icon:pickup:rejected");
    assert.ok(!rejection, "pickup should not be rejected after consumption");
    assert.equal(cityManager.getPlayerInventoryCount(socket.id, ITEM_TYPES.MEDKIT), 1, "player inventory increments on second pickup");
});
