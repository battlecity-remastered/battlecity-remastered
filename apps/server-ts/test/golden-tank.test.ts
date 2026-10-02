import test from "node:test";
import assert from "node:assert/strict";
import { Effect } from "effect";
import { decodeKnownEnvelope, makeEnvelope } from "@battlecity/protocol";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { issueAccountToken } from "../src/domain/identity/account-token.js";
import { lobbyHighScores } from "../src/domain/score/ScoreService.js";
import { initializeJoinedPlayer } from "../src/domain/spawn/CityBootstrap.js";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { buildPlayersSnapshot } from "../src/runtime/snapshot.js";
import { createRuntimeState } from "../src/runtime/types.js";

test("gold belongs to the persistent leader's authenticated account, never a callsign, raw user ID or highest online player", () => {
    const store = new UserStoreAdapter({ useSqlStorage: false }), state = createRuntimeState();
    Effect.runSync(store.addScore("original-account", 19940, "Champion"));
    Effect.runSync(store.addScore("challenger-account", 10785, "Challenger"));
    const rejected: string[] = [];
    const runtime = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: (_id, reason) => rejected.push(reason) },
        { rogueMaxBots: 0 }, state, { userStore: store, initializeJoinedPlayer });
    const join = (id: string, token?: string): void => runtime.handleRawEvent(id, makeEnvelope("lobby.join.request", 1,
        { desiredCity: 1, callsign: "Champion", userId: "original-account", ...(token ? { authToken: token } : {}) }));
    const winners = (): string[] => buildPlayersSnapshot(state).players.filter(p => p.isScoreLeader).map(p => p.id);
    join("lookalike");
    join("challenger", issueAccountToken("challenger-account", "Challenger").authToken);
    assert.deepEqual(winners(), [], "the offline leader retains the title");
    const token = issueAccountToken("original-account", "Champion").authToken;
    join("champion", token);
    assert.deepEqual(winners(), ["champion"]);
    assert.equal(buildPlayersSnapshot(state).players.find(p => p.id === "champion")!.callsign, "Champion");
    assert.equal(buildPlayersSnapshot(state).players.find(p => p.id === "champion")!.rankTitle, "Brigadier");
    assert.equal(state.socketUserIds.get("champion"), "original-account", "no verified: prefix may split the original score account");
    const decoded = decodeKnownEnvelope(makeEnvelope("players.snapshot", 1, buildPlayersSnapshot(state)));
    assert.equal(decoded._tag, "Right");
    runtime.handleDisconnect("champion");
    join("reconnected", token);
    assert.deepEqual(winners(), ["reconnected"]);
    state.players.get("reconnected")!.isBot = true;
    assert.deepEqual(winners(), []); state.players.get("reconnected")!.isBot = false;
    Effect.runSync(store.addScore("challenger-account", 10000));
    runtime.emitLobbyBootstrap("lookalike");
    assert.deepEqual(winners(), ["challenger"], "overtaking removes the former leader's gold");
    join("forged", `${token}x`);
    assert.ok(rejected.includes("InvalidEnvelope"));
    assert.equal(state.socketUserIds.has("forged"), false);
});

test("leader uses the same tie breakers as high scores and never awards zero scores", () => {
    const store = new UserStoreAdapter({ useSqlStorage: false }), state = createRuntimeState();
    Effect.runSync(store.getOrCreate("a"));
    Effect.runSync(lobbyHighScores(store, state)); assert.equal(state.scoreLeaderUserId, null);
    Effect.runSync(store.addScore("a", 100)); Effect.runSync(store.addScore("b", 50)); Effect.runSync(store.addScore("b", 50));
    const board = Effect.runSync(lobbyHighScores(store, state));
    assert.equal(board[0]!.userId, "b", "equal points prefer more orbs");
    assert.equal(state.scoreLeaderUserId, board[0]!.userId);
});
