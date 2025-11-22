"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const PlayerFactory = require("../src/PlayerFactory");
const Player = require("../src/Player");

test("applyIdentityToPlayer attaches rank metadata from score service", () => {
    const profile = { points: 1200, rankTitle: "Lieutenant" };
    const scoreService = {
        resolveRank: (points) => (points >= 200 ? "Corporal" : "Private"),
        syncIdentity: () => ({ profile }),
        getProfile: () => profile
    };
    const factory = new PlayerFactory({ players: {} }, { scoreService });

    const player = new Player("socket-1", {}, Date.now());

    factory.applyIdentityToPlayer(player, { id: "user-1", name: "Pilot" });

    assert.equal(player.userId, "user-1");
    assert.equal(player.points, profile.points);
    assert.equal(player.rankTitle, profile.rankTitle);
});

test("updatePlayerScores refreshes active players and emits updates", () => {
    const existingProfile = { points: 50, rankTitle: null };
    const updatedProfile = { points: 250, rankTitle: "Corporal" };
    const scoreService = {
        resolveRank: (points) => (points >= 200 ? "Corporal" : "Private"),
        getProfile: (userId) => (userId === "user-1" ? updatedProfile : null)
    };
    const game = { players: {} };
    const factory = new PlayerFactory(game, { scoreService });
    const emissions = [];
    factory.io = {
        emit(event, payload) {
            emissions.push({ event, payload: JSON.parse(payload) });
        }
    };

    const player = new Player("socket-1", { userId: "user-1", points: existingProfile.points }, Date.now());
    game.players[player.id] = player;

    factory.updatePlayerScores(["user-1"]);

    assert.equal(player.points, updatedProfile.points);
    assert.equal(player.rankTitle, updatedProfile.rankTitle);
    assert.equal(emissions.length, 1);
    assert.equal(emissions[0].event, "player");
    assert.equal(emissions[0].payload.id, "socket-1");
});
