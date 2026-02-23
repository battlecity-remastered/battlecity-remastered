import test from "node:test";
import assert from "node:assert/strict";
import { makeKnownEnvelope } from "@battlecity/protocol";
import { applyServerEvent } from "../src/app/network-events.js";
import { createClientState } from "../src/app/state.js";

test("lobby lifecycle events update lobby state", () => {
    const state = createClientState();

    applyServerEvent(state, makeKnownEnvelope("lobby.assignment", 1, {
        id: "p1",
        city: 2,
        role: "mayor"
    }));
    applyServerEvent(state, makeKnownEnvelope("lobby.denied", 2, {
        reason: "lobby_full"
    }));
    applyServerEvent(state, makeKnownEnvelope("lobby.snapshot", 3, [
        {
            city: 2,
            mayorId: "p1",
            recruitCount: 1
        }
    ]));
    applyServerEvent(state, makeKnownEnvelope("lobby.released", 4, {
        id: "p2",
        city: 2
    }));

    assert.equal(state.local.id, "p1");
    assert.equal(state.local.city, 2);
    assert.equal(state.lobby.deniedReason, "lobby_full");
    assert.equal(state.lobby.assignments.length, 1);
    assert.equal(state.lobby.assignments[0]?.mayorId, "p1");
    assert.equal(state.lobby.lastReleasedPlayerId, "p2");
});
