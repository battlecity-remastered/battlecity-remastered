"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const HazardManager = require("../src/hazards/HazardManager");
const {
    TILE_SIZE,
    DAMAGE_MINE,
    TIMER_DFG
} = require("../src/gameplay/constants");
const { ITEM_TYPES } = require("../src/items");

const HAZARD_REVEAL_DURATION_MS = 750;

const createMockFn = () => {
    const fn = (...args) => {
        fn.calls.push(args);
        if (fn.impl) {
            return fn.impl(...args);
        }
        return fn.returnValue;
    };
    fn.calls = [];
    fn.impl = null;
    fn.returnValue = undefined;
    fn.mockImplementation = (impl) => {
        fn.impl = impl;
        return fn;
    };
    fn.mockReturnValue = (value) => {
        fn.returnValue = value;
        return fn;
    };
    fn.mockReset = () => {
        fn.calls.length = 0;
        fn.impl = null;
        fn.returnValue = undefined;
    };
    return fn;
};

const setupManager = ({
    teamMap = {},
    players = {},
    cityManager = null
} = {}) => {
    const game = { players: { ...players } };
    if (cityManager) {
        game.buildingFactory = { cityManager };
    }
    const playerFactory = {
        getPlayerTeam: createMockFn(),
        applyDamage: createMockFn(),
        applyFreeze: createMockFn()
    };
    playerFactory.getPlayerTeam.mockImplementation((socketId) => teamMap[socketId] ?? null);

    const manager = new HazardManager(game, playerFactory);
    const io = { emit: createMockFn() };
    manager.setIo(io);

    return { manager, playerFactory, io, game, teamMap };
};

const placeHazard = (manager, hazard) => {
    const base = {
        id: "hazard_test",
        ownerId: "owner_socket",
        teamId: 1,
        x: 0,
        y: 0,
        type: "mine",
        createdAt: 0,
        active: true,
        armed: true,
        detonateAt: null,
        revealedAt: null,
        cleanupAt: null,
        pendingRemovalReason: null,
        triggeredBy: null,
        triggeredTeam: null
    };
    const next = Object.assign({}, base, hazard);
    manager.hazards.set(next.id, next);
    return next;
};

test("mines damage enemy players server-side and reveal before cleanup", () => {
    const enemySocket = "enemy_socket";
    const { manager, playerFactory, io } = setupManager({
        teamMap: {
            owner_socket: 1,
            [enemySocket]: 2
        },
        players: {
            [enemySocket]: {
                id: "enemy_player",
                offset: { x: 0, y: 0 }
            }
        }
    });

    const hazard = placeHazard(manager, {
        id: "mine_1",
        type: "mine"
    });

    const originalNow = Date.now;
    let currentNow = 5_000;
    Date.now = () => currentNow;

    try {
        manager.update(16);

        assert.equal(playerFactory.applyDamage.calls.length, 1, "mine should damage the triggering player");
        const [socketId, amount, meta] = playerFactory.applyDamage.calls[0];
        assert.equal(socketId, enemySocket);
        assert.equal(amount, DAMAGE_MINE);
        assert.deepEqual(meta, {
            type: "mine",
            hazardId: hazard.id,
            ownerId: hazard.ownerId,
            teamId: hazard.teamId
        });

        assert.equal(hazard.active, false, "mine should be inactive after triggering");
        assert.equal(hazard.armed, false, "mine should disarm after triggering");
        assert.equal(hazard.revealedAt, currentNow);
        assert.equal(hazard.cleanupAt, currentNow + HAZARD_REVEAL_DURATION_MS);
        assert.equal(hazard.triggeredBy, "enemy_player");
        assert.equal(hazard.triggeredTeam, 2);

        const updateCalls = io.emit.calls.filter(([event]) => event === "hazard:update");
        assert.equal(updateCalls.length, 1, "hazard update should be broadcast once");
        const updatePayload = JSON.parse(updateCalls[0][1]);
        assert.equal(updatePayload.id, hazard.id);
        assert.equal(updatePayload.active, false);
        assert.equal(updatePayload.revealedAt, currentNow);
        assert.equal(updatePayload.triggeredBy, "enemy_player");
        assert.equal(updatePayload.triggeredTeam, 2);

        currentNow += HAZARD_REVEAL_DURATION_MS + 10;
        manager.update(16);

        assert.equal(manager.hazards.size, 0, "mine should be removed after reveal window");
        const removeCalls = io.emit.calls.filter(([event]) => event === "hazard:remove");
        assert.equal(removeCalls.length, 1, "hazard removal should be broadcast");
        const removePayload = JSON.parse(removeCalls[0][1]);
        assert.equal(removePayload.id, hazard.id);
        assert.equal(removePayload.reason, "mine_triggered");
    } finally {
        Date.now = originalNow;
    }
});

test("mines ignore friendly players that overlap the tile", () => {
    const friendlySocket = "friend_socket";
    const { manager, playerFactory, io } = setupManager({
        teamMap: {
            owner_socket: 1,
            [friendlySocket]: 1
        },
        players: {
            [friendlySocket]: {
                id: "friendly_player",
                offset: { x: 0, y: 0 }
            }
        }
    });

    const hazard = placeHazard(manager, {
        id: "mine_2",
        type: "mine"
    });

    const originalNow = Date.now;
    Date.now = () => 10_000;

    try {
        manager.update(16);

        assert.equal(playerFactory.applyDamage.calls.length, 0, "friendly players should not take mine damage");
        const updateCalls = io.emit.calls.filter(([event]) => event === "hazard:update");
        assert.equal(updateCalls.length, 0, "friendly overlap should not reveal the mine");
        assert.equal(manager.hazards.get(hazard.id).active, true, "mine should remain active");
    } finally {
        Date.now = originalNow;
    }
});

test("friendly players can pick up mines to refund city inventory", () => {
    const friendlySocket = "friend_socket";
    const cityManager = {
        recordInventoryPickup: createMockFn(),
    };
    const { manager, io } = setupManager({
        teamMap: {
            owner_socket: 1,
            [friendlySocket]: 1
        },
        players: {
            [friendlySocket]: {
                id: "friendly_player",
                offset: { x: 0, y: 0 }
            }
        },
        cityManager
    });

    const hazard = placeHazard(manager, {
        id: "mine_pickup",
        type: "mine"
    });

    const socket = { id: friendlySocket };
    manager.handleRemove(socket, { id: hazard.id, reason: "picked_up" });

    assert.equal(manager.hazards.has(hazard.id), false, "mine should be removed when picked up by a teammate");
    const removeCalls = io.emit.calls.filter(([event]) => event === "hazard:remove");
    assert.equal(removeCalls.length, 1, "pickup should broadcast hazard removal");
    const removePayload = JSON.parse(removeCalls[0][1]);
    assert.equal(removePayload.reason, "picked_up");

    assert.equal(cityManager.recordInventoryPickup.calls.length, 1, "pickup should restore city inventory");
    const [socketId, cityId, itemType, quantity] = cityManager.recordInventoryPickup.calls[0];
    assert.equal(socketId, friendlySocket);
    assert.equal(cityId, 1);
    assert.equal(itemType, ITEM_TYPES.MINE);
    assert.equal(quantity, 1);
});

test("dfgs freeze enemy players and share reveal metadata", () => {
    const enemySocket = "enemy_socket";
    const { manager, playerFactory, io } = setupManager({
        teamMap: {
            owner_socket: 1,
            [enemySocket]: 2
        },
        players: {
            [enemySocket]: {
                id: "enemy_player",
                offset: { x: TILE_SIZE / 2, y: TILE_SIZE / 2 }
            }
        }
    });

    playerFactory.applyFreeze.mockImplementation(() => undefined);

    const hazard = placeHazard(manager, {
        id: "dfg_1",
        type: "dfg"
    });

    const originalNow = Date.now;
    let currentNow = 15_000;
    Date.now = () => currentNow;

    try {
        manager.update(16);

        assert.equal(playerFactory.applyDamage.calls.length, 0, "dfg should not apply direct damage");
        assert.equal(playerFactory.applyFreeze.calls.length, 1, "dfg should apply freeze to the triggering player");
        const [socketId, duration, meta] = playerFactory.applyFreeze.calls[0];
        assert.equal(socketId, enemySocket);
        assert.equal(duration, TIMER_DFG);
        assert.deepEqual(meta, {
            source: "dfg",
            hazardId: hazard.id,
            ownerId: hazard.ownerId
        });

        assert.equal(hazard.active, false);
        assert.equal(hazard.revealedAt, currentNow);
        assert.equal(hazard.triggeredBy, "enemy_player");
        assert.equal(hazard.triggeredTeam, 2);

        const updateCalls = io.emit.calls.filter(([event]) => event === "hazard:update");
        assert.equal(updateCalls.length, 1);
        const updatePayload = JSON.parse(updateCalls[0][1]);
        assert.equal(updatePayload.type, "dfg");
        assert.equal(updatePayload.triggeredBy, "enemy_player");

        currentNow += HAZARD_REVEAL_DURATION_MS + 5;
        manager.update(16);

        const removeCalls = io.emit.calls.filter(([event]) => event === "hazard:remove");
        assert.equal(removeCalls.length, 1);
        const removePayload = JSON.parse(removeCalls[0][1]);
        assert.equal(removePayload.reason, "dfg_triggered");
    } finally {
        Date.now = originalNow;
    }
});

