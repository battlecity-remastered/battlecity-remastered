import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";

const makeHarness = () => {
    const broadcast: EventEnvelope[] = [];
    const direct: Array<{ socketId: string; event: EventEnvelope }> = [];
    const rejected: Array<{ socketId: string; reason: string }> = [];

    const runtime = new GameRuntime({
        emitAll: (event) => {
            broadcast.push(event);
        },
        emitTo: (socketId, event) => {
            direct.push({ socketId, event });
        },
        reject: (socketId, reason) => {
            rejected.push({ socketId, reason });
        }
    });

    return { runtime, broadcast, direct, rejected };
};

test("join + movement emits assignment and snapshots", () => {
    const { runtime, broadcast, direct, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 2,
        direction: 4,
        isMoving: true,
        offset: { x: 100, y: 100 }
    }));

    assert.equal(rejected.length, 0);
    assert.equal(direct.length, 1);
    assert.equal(direct[0]?.event.type, "lobby.assignment");
    assert.equal(direct[0]?.event.payload.city, 2);

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length >= 2);
    const lastSnapshot = snapshots.at(-1);
    assert.ok(lastSnapshot);

    const players = lastSnapshot.payload as Array<{ id: string; offset: { x: number; y: number } }>;
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "s1");
    assert.notEqual(players[0]?.offset.x, 100);
});

test("invalid event payload is rejected", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("s1", {
        type: "player.update",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: { wrong: true }
    });

    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "invalid_envelope");
});

test("bullet tick resolves hits and emits health + death", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));

    runtime.handleRawEvent("attacker", makeEnvelope("player.update", 3, {
        id: "attacker",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 512, y: 512 }
    }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 4, {
        id: "target",
        city: 2,
        direction: 16,
        isMoving: false,
        offset: { x: 600, y: 512 }
    }));

    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 5, {
        ownerId: "attacker",
        position: { x: 512, y: 512 },
        direction: 0,
        type: 2
    }));

    for (let i = 0; i < 6; i += 1) {
        runtime.tickBullets();
    }

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.ok(healthEvents.length > 0);

    // 3 heavy bullets should drop 100 health to 0.
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 6, {
        ownerId: "attacker",
        position: { x: 512, y: 512 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 7, {
        ownerId: "attacker",
        position: { x: 512, y: 512 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 8, {
        ownerId: "attacker",
        position: { x: 512, y: 512 },
        direction: 0,
        type: 2
    }));

    for (let i = 0; i < 20; i += 1) {
        runtime.tickBullets();
    }

    const deadEvents = broadcast.filter((event) => event.type === "player.dead");
    assert.ok(deadEvents.some((event) => (event.payload as { id: string }).id === "target"));
});
