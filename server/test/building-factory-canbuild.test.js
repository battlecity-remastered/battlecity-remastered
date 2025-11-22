"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const BuildingFactory = require("../src/BuildingFactory");

const createSocket = () => {
    const emits = [];
    return {
        id: "socket_1",
        emit: (...args) => emits.push(args),
        broadcast: { emit: () => {} },
        getEmits: () => emits,
        clear: () => emits.splice(0, emits.length)
    };
};

const createGame = () => ({
    players: {
        socket_1: { city: 0, isMayor: true }
    }
});

test("server enforces canBuild progression and resets after demolition", () => {
    try {
        const game = createGame();
        const factory = new BuildingFactory(game);
        const socket = createSocket();

        // First build should succeed (Laser Research allowed by default).
        factory.handleNewBuilding(socket, {
            id: "b1",
            type: 412,
            x: 10,
            y: 10,
            city: 0,
        });

        assert.equal(factory.buildings.has("b1"), true, "first build should register");

        // Second build of same type should be denied as locked.
        socket.clear();
        factory.handleNewBuilding(socket, {
            id: "b2",
            type: 412,
            x: 20,
            y: 20,
            city: 0,
        });

        const denied = socket.getEmits();
        assert.ok(denied.some(([event, payload]) => {
            return event === 'build:denied' && JSON.parse(payload).reason === 'locked';
        }), `second build should be denied as locked (emits=${JSON.stringify(denied)})`);

        // Demolish should reset canBuild back to allowed.
        factory.removeBuilding("b1", false);
        socket.clear();
        factory.handleNewBuilding(socket, {
            id: "b3",
            type: 412,
            x: 30,
            y: 30,
            city: 0,
        });

        assert.equal(factory.buildings.has("b3"), true, "after demolition, building type should be allowed again");
    } catch (error) {
        console.error("Test failure:", error);
        throw error;
    }
});
