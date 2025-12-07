"use strict";

const assert = require("node:assert");
const { test } = require("node:test");

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

const createIo = () => ({
    emitted: [],
    emit(event, payload) {
        this.emitted.push({ event, payload });
    }
});

test("IconDropManager shares inventory items across teammates", () => {
    const game = { players: {} };
    const cityManager = new CityManager(game);
    const playerFactory = {
        getPlayer: (socketId) => game.players[socketId] || null
    };
    const dropManager = new IconDropManager({ cityManager, playerFactory });
    dropManager.setIo(createIo());

    const socket = createSocket("socket-dropper");
    const player = { id: "pilot-1", city: 0 };
    game.players[socket.id] = player;
    cityManager.ensureCity(0);

    cityManager.recordInventoryPickup(socket.id, 0, ITEM_TYPES.CLOAK, 1);
    assert.strictEqual(cityManager.getInventoryCount(0, ITEM_TYPES.CLOAK), 1);

    dropManager.handleDrop(socket, {
        id: "shared_cloak",
        type: ITEM_TYPES.CLOAK,
        x: 100,
        y: 200
    });

    assert.strictEqual(
        cityManager.getInventoryCount(0, ITEM_TYPES.CLOAK),
        1,
        "city inventory remains unchanged while item is on the ground"
    );
    const playerInventory = cityManager.inventoryByPlayer.get(socket.id);
    assert.ok(!playerInventory || !playerInventory.items.has(ITEM_TYPES.CLOAK), "player inventory releases the dropped item");

    dropManager.handlePickup(socket, { id: "shared_cloak" });

    // Player should regain the drop; city total should stay consistent (1)
    const updatedInventory = cityManager.inventoryByPlayer.get(socket.id);
    assert.ok(updatedInventory?.items.get(ITEM_TYPES.CLOAK) === 1, "player regains the shared drop");
    assert.strictEqual(cityManager.getInventoryCount(0, ITEM_TYPES.CLOAK), 1, "city inventory unchanged after pickup");

    const removalEvent = dropManager.io.emitted.find((entry) => entry.event === "icon:remove");
    assert.ok(removalEvent, "pickup should broadcast icon removal");
});
