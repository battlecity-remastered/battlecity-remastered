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

test("building placement enforces assigned city", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 2, {
        ownerId: "s1",
        cityId: 3,
        type: 109,
        tileX: 5,
        tileY: 6
    }));

    const placed = broadcast.filter((event) => event.type === "building.placed");
    assert.equal(placed.length, 0);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "city_mismatch");
});

test("building demolish checks ownerId when provided", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 2, {
        ownerId: "s1",
        cityId: 2,
        type: 109,
        tileX: 5,
        tileY: 6
    }));

    const placed = broadcast.find((event) => event.type === "building.placed");
    assert.ok(placed);
    const placedPayload = placed.payload as { id: string; cityId: number };

    runtime.handleRawEvent("s1", makeEnvelope("building.demolish.request", 3, {
        id: placedPayload.id,
        cityId: placedPayload.cityId,
        ownerId: "someone-else"
    }));

    const demolished = broadcast.filter((event) => event.type === "building.demolished");
    assert.equal(demolished.length, 0);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "owner_mismatch");
});

test("bullet fire before join is rejected", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("bullet.fire.request", 1, {
        ownerId: "s1",
        position: { x: 32, y: 32 },
        direction: 0,
        type: 0
    }));

    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "player_not_joined");
});

test("demolish rejects missing building id", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.demolish.request", 2, {
        id: "missing_building",
        cityId: 1,
        ownerId: "s1"
    }));

    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "building_not_found");
});

test("disconnect emits player.removed and clears player from snapshot", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 32, y: 32 }
    }));

    runtime.handleDisconnect("s1");

    const removed = broadcast.filter((event) => event.type === "player.removed");
    assert.equal(removed.length, 1);
    assert.equal((removed[0]?.payload as { id: string }).id, "s1");

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    const latestSnapshot = snapshots.at(-1);
    assert.ok(latestSnapshot);
    const players = latestSnapshot.payload as Array<{ id: string }>;
    assert.equal(players.some((player) => player.id === "s1"), false);
});

test("first player in city gets mayor role and second gets recruit", () => {
    const { runtime, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p2", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));

    const assignments = direct
        .filter((entry) => entry.event.type === "lobby.assignment")
        .map((entry) => entry.event.payload as { id: string; role: "mayor" | "recruit" });

    assert.equal(assignments.length, 2);
    assert.equal(assignments[0]?.id, "p1");
    assert.equal(assignments[0]?.role, "mayor");
    assert.equal(assignments[1]?.id, "p2");
    assert.equal(assignments[1]?.role, "recruit");
});

test("lobby leave emits released and updates snapshot", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("lobby.leave.request", 2, {}));

    const released = broadcast.filter((event) => event.type === "lobby.released");
    assert.equal(released.length, 1);
    assert.equal((released[0]?.payload as { id: string }).id, "p1");

    const snapshots = broadcast.filter((event) => event.type === "lobby.snapshot");
    assert.ok(snapshots.length >= 1);
    const latest = snapshots.at(-1);
    assert.ok(latest);
    const city1 = (latest.payload as Array<{ city: number; recruitCount: number; mayorId?: string }>).find((entry) => {
        return entry.city === 1;
    });
    assert.ok(city1);
    assert.equal(city1?.mayorId, undefined);
    assert.equal(city1?.recruitCount, 0);
});

test("legacy colon event names are accepted on ingress", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));

    runtime.handleRawEvent("p1", {
        type: "player:update",
        version: "1",
        seq: 2,
        ts: Date.now(),
        payload: {
            id: "p1",
            city: 0,
            direction: 0,
            isMoving: false,
            offset: { x: 140, y: 140 }
        }
    });

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length > 0);
});
