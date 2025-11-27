"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
    formatJoinNotification,
    formatOrbNotification,
    formatRankTag
} = require("../src/utils/discordMessages.js");

test("join notifications include rank tag, player, city, and role", () => {
    const message = formatJoinNotification({
        playerName: "Nova",
        cityName: "Balkh",
        roleLabel: "Mayor",
        rankTitle: "Captain"
    });
    assert.equal(message, "[Captain] Nova joined Balkh as Mayor.");
});

test("orb notifications keep rank prefix and attacker context", () => {
    const message = formatOrbNotification({
        playerName: "Ivy",
        attackerCityName: "Balkh",
        targetCityName: "Iqaluit",
        rankTitle: "Private",
        points: 150
    });
    assert.equal(message, "[Private] Ivy orbed Iqaluit for Balkh (+150 pts).");
});

test("formatters fall back when fields are missing", () => {
    const joinMessage = formatJoinNotification({ playerName: "Rogue" });
    assert.equal(joinMessage, "[Unranked] Rogue joined Unknown city as Recruit.");

    const orbMessage = formatOrbNotification({
        playerName: "Rogue",
        targetCityName: "Balkh",
        rankTitle: "",
        points: 0
    });
    assert.equal(orbMessage, "[Unranked] Rogue orbed Balkh.");

    assert.equal(formatRankTag(null), "[Unranked]");
});
