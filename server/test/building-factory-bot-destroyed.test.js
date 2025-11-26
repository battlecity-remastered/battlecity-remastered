"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");

const createSocket = (id = "socket_1") => {
    const emits = [];
    return {
        id,
        emit: (...args) => emits.push(args),
        broadcast: { emit: () => {} },
        getEmits: () => emits,
        clear: () => emits.splice(0, emits.length)
    };
};

const createGame = () => ({
    players: {
        socket_1: { city: 0, isMayor: true },
        socket_2: { city: 0, isMayor: true }
    }
});

test("owner can clear bot-destroyed building without mayor role", () => {
    const game = createGame();
    const factory = new BuildingFactory(game);
    const socket = createSocket("socket_1");

    factory.handleNewBuilding(socket, {
        id: "b1",
        type: 300,
        x: 1,
        y: 1,
        city: 0,
    });
    assert.equal(factory.buildings.has("b1"), true, "building should be created");

    // Owner is no longer mayor, but should be able to clear their own destroyed building.
    game.players.socket_1.isMayor = false;
    socket.clear();
    factory.handleDemolish(socket, JSON.stringify({ id: "b1", reason: "bot_destroyed" }));

    assert.equal(factory.buildings.has("b1"), false, "owner should be allowed to clear bot-destroyed building");
    assert.equal(socket.getEmits().length, 0, "should not emit demolish:denied for valid owner bot_destroyed request");
});

test("bot_destroyed demolish is denied for non-owners", () => {
    const game = createGame();
    const factory = new BuildingFactory(game);
    const ownerSocket = createSocket("socket_1");
    const requester = createSocket("socket_2");

    factory.handleNewBuilding(ownerSocket, {
        id: "b2",
        type: 300,
        x: 2,
        y: 2,
        city: 0,
    });
    assert.equal(factory.buildings.has("b2"), true, "building should be created");

    requester.clear();
    factory.handleDemolish(requester, JSON.stringify({ id: "b2", reason: "bot_destroyed" }));

    const denied = requester.getEmits();
    assert.equal(factory.buildings.has("b2"), true, "non-owner bot_destroyed request should not remove building");
    assert.ok(denied.some(([event, payload]) => event === "demolish:denied" && payload?.reason === "not_owner"), "should emit demolish:denied/not_owner");
});
