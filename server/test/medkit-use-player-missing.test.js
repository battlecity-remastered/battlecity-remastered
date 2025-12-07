"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");

test("item:use medkit rejects when player is missing (e.g., after death)", () => {
    const game = { players: {} };
    const factory = new PlayerFactory(game, {});
    const socket = {
        id: "ghost",
        emitted: [],
        emit(event, payload) {
            this.emitted.push({ event, payload: JSON.parse(payload) });
        }
    };

    factory.handleItemUse(socket, JSON.stringify({ type: "medkit" }));

    const rejection = socket.emitted.find((e) => e.event === "item:use:rejected");
    assert.ok(rejection, "expected rejection when player missing");
    assert.equal(rejection.payload.reason, "unknown_player");
});
