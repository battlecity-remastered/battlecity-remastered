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
    assert.equal(lines[0], "Reykjavik lobby  p1");
    assert.equal(lines[1], "Tabs: [Assignments*] [Scores]");
    assert.ok(lines[2].includes("View: assignments"));
    assert.equal(lines[3], "Denied: lobby_full");
    assert.equal(lines[4], "Released: p4");
    assert.equal(lines[5], "Reykjavik: mayor p1 recruits 2");
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
    assert.equal(buildLobbyLines(state)[1], "Tabs: [Assignments] [Scores*]");
    assert.equal(applyLobbyAction(state, "PageDown"), true);
    assert.equal(state.ui.lobbyCityFilter, 0);
    assert.equal(applyLobbyAction(state, "PageDown"), true);
    assert.equal(state.ui.lobbyCityFilter, 1);
    assert.equal(applyLobbyAction(state, "Home"), true);
    assert.equal(state.ui.lobbyCityFilter, -1);
});

test("buildLobbyLines scores view shows player leaderboard entries", () => {
    const state = createClientState();
    state.ui.lobbyView = "scores";
    state.lobby.highScores = [
        {
            userId: "u2",
            name: "Pilot Two",
            points: 220,
            rankTitle: "sergeant",
            orbs: 1,
            assists: 2
        },
        {
            userId: "u1",
            name: "Pilot One",
            points: 320,
            rankTitle: "captain"
        }
    ];

    const lines = buildLobbyLines(state);
    assert.ok(lines.some((line) => line.includes("#1 Pilot One: 320 pts (captain)")));
    assert.ok(lines.some((line) => line.includes("#2 Pilot Two: 220 pts (sergeant)")));
});
