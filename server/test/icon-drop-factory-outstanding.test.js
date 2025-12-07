"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");
const IconDropManager = require("../src/IconDropManager");
const { ITEM_TYPES } = require("../src/items");

const createSocket = (id) => ({
    id,
    emitted: [],
    emit(event, payload) {
        this.emitted.push({ event, payload });
    }
});

test("factory icon pickup keeps outstanding counts at cap", () => {
    const game = { tick: 0, players: {} };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;

    const player = { id: "player1", city: 1 };
    game.players[player.id] = player;

    const iconDropManager = new IconDropManager({
        cityManager: buildingFactory.cityManager,
        playerFactory: {
            getPlayer: (socketId) => game.players[socketId] || null
        },
        buildingFactory
    });
    buildingFactory.setManagers({ iconDropManager });
    iconDropManager.setIo({ emit() {} });

    buildingFactory.cityManager.ensureCity(player.city);

    // Simulate an active medkit factory with one item produced.
    const factoryBuilding = {
        id: "factory1",
        type: 102,
        cityId: player.city,
        itemsLeft: 1,
        x: 0,
        y: 0
    };
    buildingFactory.buildings.set(factoryBuilding.id, factoryBuilding);

    const icon = buildingFactory.registerFactoryIcon({
        id: "icon1",
        type: ITEM_TYPES.MEDKIT,
        x: 100,
        y: 100,
        cityId: player.city,
        teamId: player.city,
        buildingId: factoryBuilding.id,
        quantity: 1
    });

    const socket = createSocket(player.id);

    iconDropManager.handlePickup(socket, { id: icon.id });

    assert.equal(factoryBuilding.itemsLeft, 0, "factory stock decremented");
    assert.equal(
        buildingFactory.cityManager.getInventoryCount(player.city, ITEM_TYPES.MEDKIT),
        1,
        "city inventory reflects collected factory item"
    );
    assert.equal(
        buildingFactory.getCityOutstandingItemCount(player.city, ITEM_TYPES.MEDKIT),
        1,
        "outstanding count tracks collected factory item"
    );

    // Dropping the item should not shrink outstanding inventory (ground icons still count).
    iconDropManager.handleDrop(socket, {
        type: ITEM_TYPES.MEDKIT,
        x: 200,
        y: 200
    });

    assert.equal(
        buildingFactory.getCityOutstandingItemCount(player.city, ITEM_TYPES.MEDKIT),
        1,
        "outstanding inventory unchanged after drop"
    );
});
