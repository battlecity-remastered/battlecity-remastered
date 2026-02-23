import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildLobbyLines } from "../src/ui/lobby/LobbyManager.js";

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
    assert.equal(lines[0], "Lobby city 2 (p1)");
    assert.equal(lines[1], "Denied: lobby_full");
    assert.equal(lines[2], "Released: p4");
    assert.equal(lines[3], "C2: mayor p1 recruits 2");
});
