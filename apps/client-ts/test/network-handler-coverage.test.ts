import test from "node:test";
import assert from "node:assert/strict";
import {
    APPLIED_SERVER_EVENT_TYPES,
    hasServerEventHandler
} from "../src/app/network-events.js";

const EXPECTED_APPLIED_EVENT_TYPES = [
    "lobby.assignment",
    "lobby.denied",
    "lobby.snapshot",
    "lobby.released",
    "build.denied",
    "building.placed",
    "building.demolished",
    "population.update",
    "players.snapshot",
    "player.health",
    "player.dead",
    "player.removed",
    "bullet.fired",
    "bullet.resolved",
    "chat.history",
    "chat.message",
    "chat.rate_limit",
    "city.finance",
    "research.update",
    "factory.stock",
    "inventory.update",
    "icon.pickup.confirmed",
    "hazard.spawn",
    "hazard.remove",
    "city.orbed",
    "score.promotion",
    "score.profile",
    "defense.spawn",
    "defense.update",
    "defense.remove",
    "demolish.denied",
    "event.rejected"
] as const;

test("client apply handlers cover all implemented server->client gameplay events", () => {
    const actual = [...APPLIED_SERVER_EVENT_TYPES].sort();
    const expected = [...EXPECTED_APPLIED_EVENT_TYPES].sort();
    assert.deepEqual(actual, expected);

    for (const type of EXPECTED_APPLIED_EVENT_TYPES) {
        assert.equal(hasServerEventHandler(type), true);
    }
    assert.equal(hasServerEventHandler("lobby.join.request"), false);
});
