"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");

const createFactory = (onPlayerAssigned) => {
    const game = {
        players: {},
        map: [[0]]
    };
    const factory = new PlayerFactory(game, { onPlayerAssigned });
    return { factory, game };
};

test("registerAssignment invokes onPlayerAssigned with city and role details", () => {
    const events = [];
    const { factory, game } = createFactory((event) => events.push(event));
    const player = { id: "player-123456", city: 0, callsign: "Alan", isMayor: true };
    const assignment = { city: 0, isMayor: true, overflow: false };

    game.players[player.id] = player;
    factory.registerAssignment(player, assignment);

    assert.equal(events.length, 1);
    assert.equal(events[0].callsign, "Alan");
    assert.equal(events[0].cityName, "Balkh");
    assert.equal(events[0].role, "mayor");
});

test("onPlayerAssigned reports fallback names when callsign is missing", () => {
    const events = [];
    const { factory, game } = createFactory((event) => events.push(event));
    const player = { id: "socket-player-abcdef", city: 1, isMayor: false };
    const assignment = { city: 1, isMayor: false, overflow: false };

    game.players[player.id] = player;
    factory.registerAssignment(player, assignment);

    assert.equal(events.length, 1);
    assert.equal(events[0].cityName, "Iqaluit");
    assert.equal(events[0].role, "recruit");
    assert.ok(events[0].callsign && events[0].callsign.length > 0);
});
