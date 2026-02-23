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
    const assignment = direct.find((entry) => entry.event.type === "lobby.assignment");
    assert.ok(assignment);
    assert.equal((assignment.event.payload as { city: number }).city, 2);

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
    assert.equal(rejected[0]?.reason, "InvalidEnvelope");
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
    assert.equal(rejected[0]?.reason, "ValidationFailed");
});

test("recruit cannot place building and receives build.denied reason", () => {
    const { runtime, direct, rejected } = makeHarness();

    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("recruit", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("recruit", makeEnvelope("building.place.request", 3, {
        ownerId: "recruit",
        cityId: 1,
        type: 109,
        tileX: 7,
        tileY: 7
    }));

    const denied = direct.filter((entry) => {
        return entry.socketId === "recruit" && entry.event.type === "build.denied";
    });
    assert.equal(denied.length, 1);
    assert.equal((denied[0]?.event.payload as { reason: string }).reason, "not_mayor");
    assert.equal(rejected.at(-1)?.reason, "ValidationFailed");
});

test("building placement enforces research, chain, collision and budget rules", () => {
    const { runtime, broadcast, direct, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 10,
        tileY: 10
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "research_required");

    runtime.handleRawEvent("p1", makeEnvelope("research.start.request", 3, {
        cityId: 1,
        researchType: 407
    }));
    for (let i = 0; i < 40; i += 1) {
        runtime.tickBullets();
    }

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 4, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 10,
        tileY: 10
    }));
    const placed = broadcast.filter((event) => event.type === "building.placed");
    assert.equal(placed.length, 1);

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 5, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 10,
        tileY: 10
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "building_collision");

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 6, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 200,
        tileY: 200
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "build_too_far");

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 7, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 12,
        tileY: 12
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "insufficient_funds");

    assert.ok(rejected.filter((entry) => entry.reason === "ValidationFailed").length >= 3);
    assert.ok(rejected.some((entry) => entry.reason === "InsufficientFunds"));
});

test("building demolish checks ownerId when provided", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 2, {
        ownerId: "s1",
        cityId: 2,
        type: 300,
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
    assert.equal(rejected[0]?.reason, "ValidationFailed");
});

test("demolish deny emits explicit reason event", () => {
    const { runtime, direct } = makeHarness();

    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("recruit", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 3, {
        ownerId: "mayor",
        cityId: 2,
        type: 300,
        tileX: 9,
        tileY: 9
    }));
    const placed = direct.find((entry) => entry.socketId === "mayor" && entry.event.type === "build.denied");
    assert.equal(placed, undefined);

    const built = runtime.getReadonlyState();
    const firstBuilding = Array.from(built.buildings.values())[0];
    assert.ok(firstBuilding);

    runtime.handleRawEvent("recruit", makeEnvelope("building.demolish.request", 4, {
        id: firstBuilding.id,
        cityId: 2
    }));

    const denied = direct.filter((entry) => {
        return entry.socketId === "recruit" && entry.event.type === "demolish.denied";
    });
    assert.equal(denied.length, 1);
    assert.equal((denied[0]?.event.payload as { reason: string }).reason, "not_mayor");
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
    assert.equal(rejected[0]?.reason, "ResourceNotFound");
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
    assert.equal(rejected[0]?.reason, "ResourceNotFound");
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

test("player.update rejects suspicious teleport distance", () => {
    const { runtime, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 0,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 3, {
        id: "p1",
        city: 0,
        direction: 0,
        isMoving: false,
        offset: { x: 1000, y: 1000 }
    }));

    assert.ok(rejected.some((entry) => entry.reason === "ValidationFailed"));
});

test("player spawn is relocated to nearest safe offset when colliding with building footprint", () => {
    const { runtime } = makeHarness();

    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));
    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 2, {
        ownerId: "mayor",
        cityId: 0,
        type: 300,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("mayor", makeEnvelope("player.update", 3, {
        id: "mayor",
        city: 0,
        direction: 0,
        isMoving: false,
        offset: { x: 320, y: 320 }
    }));

    const player = runtime.getReadonlyState().players.get("mayor");
    assert.ok(player);
    assert.notEqual(player.x, 320);
});

test("research start spends city cash and emits update/finance", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("research.start.request", 2, {
        cityId: 1,
        researchType: 2
    }));

    const research = broadcast.find((event) => event.type === "research.update");
    assert.ok(research);
    const finance = broadcast.filter((event) => event.type === "city.finance").at(-1);
    assert.ok(finance);
    assert.ok((finance.payload as { cash: number }).cash < 200);
});

test("factory stock is produced on tick and can be collected", () => {
    const { runtime, broadcast, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    for (let i = 0; i < 15; i += 1) {
        runtime.tickBullets();
    }

    runtime.handleRawEvent("p1", makeEnvelope("factory.collect.request", 2, {
        cityId: 1,
        itemType: 0,
        amount: 1
    }));

    const stockEvents = broadcast.filter((event) => event.type === "factory.stock");
    assert.ok(stockEvents.length > 0);
    const collected = stockEvents.at(-1);
    assert.ok(collected);
    assert.ok((collected.payload as { stock: number }).stock >= 0);
    const inventoryUpdate = direct.filter((entry) => entry.event.type === "inventory.update").at(-1);
    assert.ok(inventoryUpdate);
    const items = (inventoryUpdate.event.payload as { items: Array<{ itemType: number; count: number }> }).items;
    assert.equal(items[0]?.itemType, 0);
    assert.equal(items[0]?.count, 1);
});

test("icon pickup request decrements stock and updates inventory", () => {
    const { runtime, broadcast, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    for (let i = 0; i < 15; i += 1) {
        runtime.tickBullets();
    }
    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 2, {
        cityId: 1,
        itemType: 0,
        amount: 1
    }));

    assert.ok(broadcast.some((event) => event.type === "factory.stock"));
    assert.ok(direct.some((entry) => entry.event.type === "icon.pickup.confirmed"));
    assert.ok(direct.some((entry) => entry.event.type === "inventory.update"));
});

test("medkit use heals player and consumes inventory", () => {
    const { runtime, direct, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 3, {
        id: "target",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: 1,
        position: { x: 220, y: 220 },
        radius: 120,
        damage: 20,
        fuseMs: 100
    }));
    runtime.tickBullets();
    runtime.tickBullets();

    for (let i = 0; i < 15; i += 1) {
        runtime.tickBullets();
    }
    runtime.handleRawEvent("target", makeEnvelope("icon.pickup.request", 5, {
        cityId: 1,
        itemType: 0,
        amount: 1
    }));
    runtime.handleRawEvent("target", makeEnvelope("item.use.request", 6, {
        itemType: 0
    }));

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.ok(healthEvents.some((event) => (event.payload as { source?: string }).source === "medkit"));
    const inv = direct.filter((entry) => entry.socketId === "target" && entry.event.type === "inventory.update").at(-1);
    assert.ok(inv);
    const items = (inv.event.payload as { items: Array<{ itemType: number; count: number }> }).items;
    assert.equal(items.some((item) => item.itemType === 0), false);
    assert.equal(rejected.length, 0);
});

test("hospital building heals players over ticks", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 3 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 3 }));
    runtime.handleRawEvent("owner", makeEnvelope("building.place.request", 3, {
        ownerId: "owner",
        cityId: 3,
        type: 300,
        tileX: 12,
        tileY: 12
    }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 4, {
        id: "target",
        city: 3,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 5, {
        cityId: 3,
        type: 1,
        position: { x: 220, y: 220 },
        radius: 120,
        damage: 20,
        fuseMs: 100
    }));
    runtime.tickBullets();
    runtime.tickBullets();
    runtime.tickBullets();
    runtime.tickBullets();

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.ok(healthEvents.some((event) => (event.payload as { source?: string }).source === "hospital"));
});

test("hazard deploy detonates and damages nearby players", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 3, {
        id: "target",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: 1,
        position: { x: 220, y: 220 },
        radius: 120,
        damage: 20,
        fuseMs: 100
    }));

    runtime.tickBullets();
    runtime.tickBullets();

    const removed = broadcast.filter((event) => event.type === "hazard.remove");
    assert.ok(removed.length >= 1);
    const health = broadcast.filter((event) => event.type === "player.health");
    assert.ok(health.length >= 1);
});

test("orb drop emits city.orbed and score.promotion", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("orb.drop.request", 2, {
        sourceCityId: 1,
        targetCityId: 2
    }));

    const orbed = broadcast.find((event) => event.type === "city.orbed");
    assert.ok(orbed);
    const promotion = broadcast.find((event) => event.type === "score.promotion");
    assert.ok(promotion);
});

test("chat message emits history and rate limit for spam", () => {
    const { runtime, broadcast, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));
    runtime.handleRawEvent("p1", makeEnvelope("chat.message.request", 2, {
        text: "hello",
        scope: "team"
    }));

    for (let i = 0; i < 8; i += 1) {
        runtime.handleRawEvent("p1", makeEnvelope("chat.message.request", 3 + i, {
            text: `msg-${i}`,
            scope: "global"
        }));
    }

    assert.ok(broadcast.some((event) => event.type === "chat.message"));
    assert.ok(direct.some((entry) => entry.event.type === "chat.history"));
    assert.ok(direct.some((entry) => entry.event.type === "chat.rate_limit"));
});
