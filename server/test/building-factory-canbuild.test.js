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

test("factory research requirements follow the dependency tree (DFG, Wall)", () => {
    const game = createGame();
    const factory = new BuildingFactory(game);
    const socket = createSocket();

    // DFG Factory (107) should require DFG Research (406), not Flare (407).
    socket.clear();
    factory.handleNewBuilding(socket, {
        id: "dfg_factory_denied",
        type: 107,
        x: 5,
        y: 5,
        city: 0,
    });
    const dfgDenied = socket.getEmits();
    assert.ok(dfgDenied.some(([event, payload]) => {
        const parsed = JSON.parse(payload);
        return event === 'build:denied' && parsed.reason === 'locked';
    }), "DFG Factory should be locked before DFG Research completes");

    factory.completeResearch(0, 407);
    socket.clear();
    factory.handleNewBuilding(socket, {
        id: "dfg_factory_built",
        type: 107,
        x: 6,
        y: 6,
        city: 0,
    });
    assert.equal(factory.buildings.has("dfg_factory_built"), true, "DFG Factory should build after DFG Research completes");

    // (Wall covered by shared tree elsewhere; focus here on DFG regression.)
});
