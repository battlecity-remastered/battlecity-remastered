import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyLobbyAction, buildLobbyLines } from "../src/ui/lobby/LobbyManager.js";

test("buildLobbyLines reflects assignment/deny/release state", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 2;
    state.lobby.deniedReason = "lobby_full";
    state.lobby.lastReleasedPlayerId = "p4";
    state.lobby.assignments = [
        {
            city: 2,
            mayorId: "p1",
            recruitCount: 2
        }
    ];

    const lines = buildLobbyLines(state);
    assert.equal(lines[0], "City 2 lobby  p1");
    assert.ok(lines[1].includes("View: assignments"));
    assert.equal(lines[2], "Denied: lobby_full");
    assert.equal(lines[3], "Released: p4");
    assert.equal(lines[4], "C2: mayor p1 recruits 2");
});

test("applyLobbyAction cycles view and city filter", () => {
    const state = createClientState();
    state.local.city = 1;
    state.lobby.assignments = [
        { city: 1, mayorId: "m1", recruitCount: 1 },
        { city: 3, mayorId: "m3", recruitCount: 2 }
    ];

    assert.equal(applyLobbyAction(state, "Tab"), true);
    assert.equal(state.ui.lobbyView, "scores");
    assert.equal(applyLobbyAction(state, "PageDown"), true);
    assert.equal(state.ui.lobbyCityFilter, 1);
    assert.equal(applyLobbyAction(state, "PageDown"), true);
    assert.equal(state.ui.lobbyCityFilter, 3);
    assert.equal(applyLobbyAction(state, "Home"), true);
    assert.equal(state.ui.lobbyCityFilter, -1);
});
