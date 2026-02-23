import test from "node:test";
import assert from "node:assert/strict";
import {
    HANDLED_RUNTIME_EVENT_TYPES,
    hasRuntimeEventHandler
} from "../src/runtime/dispatch.js";

const EXPECTED_RUNTIME_REQUEST_TYPES = [
    "lobby.join.request",
    "lobby.leave.request",
    "player.update",
    "player.bot_damage",
    "bullet.fire.request",
    "building.place.request",
    "building.demolish.request",
    "chat.message.request",
    "research.start.request",
    "factory.collect.request",
    "icon.pickup.request",
    "item.use.request",
    "hazard.deploy.request",
    "orb.drop.request",
    "defense.deploy.request"
] as const;

test("runtime dispatch covers all authoritative inbound request/event types", () => {
    const actual = [...HANDLED_RUNTIME_EVENT_TYPES].sort();
    const expected = [...EXPECTED_RUNTIME_REQUEST_TYPES].sort();
    assert.deepEqual(actual, expected);

    for (const type of EXPECTED_RUNTIME_REQUEST_TYPES) {
        assert.equal(hasRuntimeEventHandler(type), true);
    }
    assert.equal(hasRuntimeEventHandler("players.snapshot"), false);
});
