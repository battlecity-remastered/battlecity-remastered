import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { initializeJoinedPlayer } from "../src/domain/spawn/CityBootstrap.js";

const harness = (now: number, blockingTiles = new Set<string>()) => {
    const rejected: string[] = [];
    const runtime = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: (_id, reason) => rejected.push(reason) }, {},
        createRuntimeState({ blockingTiles }), { initializeJoinedPlayer });
    runtime.handleRawEvent("pilot", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));
    const player = runtime.getReadonlyState().players.get("pilot")!;
    Object.assign(player, { x: 480, y: 480, lastAcceptedUpdateAt: now });
    return { runtime, rejected };
};

test("WAN prediction drift does not discard movement or stopping intents, and offsets cannot teleport the tank", context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const { runtime, rejected } = harness(now);
    for (let seq = 2; seq <= 21; seq++) {
        now += 50;
        runtime.handleRawEvent("pilot", makeEnvelope("player.update", seq, {
            id: "pilot", city: 0, direction: 8, isMoving: true, throttle: 1,
            offset: { x: 9000 + seq * 30, y: 9000 }
        }));
    }
    const player = runtime.getReadonlyState().players.get("pilot")!;
    assert.equal(player.x, 480 + DEFAULT_RUNTIME_CONFIG.playerSpeed);
    assert.equal(player.y, 480);
    now += 50;
    runtime.handleRawEvent("pilot", makeEnvelope("player.update", 22, {
        id: "pilot", city: 0, direction: 8, isMoving: false, throttle: 0, offset: { x: 20_000, y: 20_000 }
    }));
    assert.equal(runtime.getReadonlyState().players.get("pilot")!.x, player.x);
    assert.deepEqual(rejected, []);
});

test("advisory positions cannot bypass authoritative terrain collision", context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const { runtime, rejected } = harness(now, new Set(["11,10"]));
    for (let seq = 2; seq < 12; seq++) {
        now += 50;
        runtime.handleRawEvent("pilot", makeEnvelope("player.update", seq, {
            id: "pilot", city: 0, direction: 8, isMoving: true, throttle: 1, offset: { x: 9000, y: 9000 }
        }));
    }
    const player = runtime.getReadonlyState().players.get("pilot")!;
    assert.equal(player.x, 480);
    assert.equal(player.y, 480);
    assert.deepEqual(rejected, []);
});

test("legacy teleport claims and invalid throttle remain rejected", context => {
    const now = 10_000;
    context.mock.method(Date, "now", () => now);
    const { runtime, rejected } = harness(now);
    runtime.handleRawEvent("pilot", makeEnvelope("player.update", 2, {
        id: "pilot", city: 0, direction: 8, isMoving: false, offset: { x: 9000, y: 9000 }
    }));
    runtime.handleRawEvent("pilot", makeEnvelope("player.update", 3, {
        id: "pilot", city: 0, direction: 8, isMoving: true, throttle: 100, offset: { x: 480, y: 480 }
    }));
    assert.deepEqual(rejected, ["ValidationFailed", "ValidationFailed"]);
    assert.equal(runtime.getReadonlyState().players.get("pilot")!.x, 480);
});
