import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState } from "../src/runtime/types.js";
import { buildPlayersSnapshot } from "../src/runtime/snapshot.js";

const harness = (now: number, blockingTiles = new Set<string>()) => {
    const state = createRuntimeState({ blockingTiles });
    state.socketCities.set("pilot", 0);
    state.players.set("pilot", { id: "pilot", city: 0, x: 480, y: 480, direction: 8, speed: 600,
        health: 100, maxHealth: 100, lastMovementInputSeq: 0, lastAcceptedUpdateAt: now });
    const rejected: string[] = [];
    const runtime = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: (_id, reason) => rejected.push(reason) }, {}, state);
    let seq = 0;
    const update = (frames: Array<{ seq: number; dtMs: number; turn: number; throttle: number }>) => runtime.handleRawEvent("pilot", makeEnvelope("player.update", ++seq, {
        id: "pilot", city: 0, direction: 8, isMoving: true, offset: { x: 20_000, y: 20_000 }, inputFrames: frames
    }));
    return { runtime, rejected, update, player: state.players.get("pilot")! };
};

test("sequenced inputs cannot teleport, duplicate travel or skip acknowledgements", context => {
    context.mock.method(Date, "now", () => 10_000);
    const { update, player, rejected, runtime } = harness(10_000);
    const frame = { seq: 1, dtMs: 50, turn: 1, throttle: 1 };
    update([frame]);
    const pose = { x: player.x, y: player.y, direction: player.direction };
    assert.ok(Math.hypot(player.x - 480, player.y - 480) <= 30);
    assert.ok(Math.abs(player.direction - 8.6) < 1e-10);
    update([frame]);
    assert.deepEqual({ x: player.x, y: player.y, direction: player.direction }, pose);
    update([{ ...frame, seq: 3 }]);
    update([{ ...frame, seq: 2, dtMs: 101 }]);
    update([{ ...frame, seq: 2, turn: 2 }]);
    update([{ ...frame, seq: 2, throttle: 2 }]);
    assert.deepEqual(rejected, Array(4).fill("ValidationFailed"));
    const snapshot = buildPlayersSnapshot(runtime.getReadonlyState());
    assert.deepEqual(snapshot.players[0]!.movementAck, { seq: 1, direction: pose.direction });
});

test("claimed frame durations remain bounded by elapsed server time", context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const { update, player, rejected } = harness(now);
    const frames = Array.from({ length: 32 }, (_, i) => ({ seq: i + 1, dtMs: 100, turn: 0, throttle: 1 }));
    update(frames);
    assert.ok(player.x <= 480 + 150 + 1e-6);
    assert.equal(player.lastMovementInputSeq, 32);
    now += 50;
    update([{ seq: 33, dtMs: 100, turn: 0, throttle: 1 }]);
    assert.ok(player.x <= 480 + 180 + 1e-6);
    assert.deepEqual(rejected, []);
});

test("long input frames cannot tunnel through a tile; freeze also stops turning", context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const { update, player, rejected } = harness(now, new Set(["11,10"]));
    update([{ seq: 1, dtMs: 100, turn: 0, throttle: 1 }]);
    assert.ok(player.x + 24 + 12 <= 11 * 48);
    const x = player.x;
    player.frozenUntil = now + 2000;
    now += 100;
    update([{ seq: 2, dtMs: 100, turn: 1, throttle: -1 }]);
    assert.equal(player.x, x);
    assert.equal(player.direction, 8);
    assert.equal(player.lastMovementInputSeq, 2);
    assert.deepEqual(rejected, []);
});
