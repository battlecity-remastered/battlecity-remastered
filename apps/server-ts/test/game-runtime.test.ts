import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import { Effect } from "effect";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { createRuntimeState, type RuntimeConfig } from "../src/runtime/types.js";

const makeHarness = (
    config: Partial<RuntimeConfig> = {},
    runtimeServices: {
        notifyOrbVictory?: (playerId: string, sourceCityId: number, targetCityId: number) => Effect.Effect<void>;
    } = {}
) => {
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
    }, config, createRuntimeState(), {
        userStore: new UserStoreAdapter(),
        ...runtimeServices
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

test("house attachment population updates grow over ticks and clear on house demolish", () => {
    const { runtime, broadcast } = makeHarness({ buildingCost: 10 });

    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 2, {
        ownerId: "mayor",
        cityId: 1,
        type: 300,
        tileX: 6,
        tileY: 6
    }));
    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 3, {
        ownerId: "mayor",
        cityId: 1,
        type: 200,
        tileX: 7,
        tileY: 6
    }));

    const placed = broadcast.filter((event) => event.type === "building.placed");
    const houseId = (placed[0]?.payload as { id: string } | undefined)?.id;
    const hospitalId = (placed[1]?.payload as { id: string } | undefined)?.id;
    assert.ok(houseId);
    assert.ok(hospitalId);

    for (let i = 0; i < 8; i += 1) {
        runtime.tickBullets();
    }

    const updates = broadcast
        .filter((event) => event.type === "population.update")
        .map((event) => event.payload as {
            id: string;
            population: number;
            removed: boolean;
            attachedHouseId?: string;
        });
    const factoryUpdate = updates.find((update) => {
        return update.id === hospitalId && update.population > 0 && update.removed === false;
    });
    assert.ok(factoryUpdate);
    assert.equal(factoryUpdate?.attachedHouseId, houseId);

    runtime.handleRawEvent("mayor", makeEnvelope("building.demolish.request", 4, {
        id: houseId,
        cityId: 1
    }));

    const finalUpdates = broadcast
        .filter((event) => event.type === "population.update")
        .map((event) => event.payload as {
            id: string;
            population: number;
            removed: boolean;
        });
    const houseRemoved = finalUpdates.find((update) => {
        return update.id === houseId && update.removed;
    });
    const factoryCleared = [...finalUpdates].reverse().find((update) => {
        return update.id === hospitalId;
    });
    assert.ok(houseRemoved);
    assert.equal(factoryCleared?.population, 0);
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

test("bullet collision removes active hazards authoritatively", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("enemy", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("enemy", makeEnvelope("player.update", 3, {
        id: "enemy",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: 1,
        position: { x: 190, y: 100 },
        radius: 96,
        damage: 20,
        fuseMs: 5000
    }));
    runtime.handleRawEvent("enemy", makeEnvelope("bullet.fire.request", 5, {
        ownerId: "enemy",
        position: { x: 100, y: 100 },
        direction: 0,
        type: 0
    }));

    for (let i = 0; i < 3; i += 1) {
        runtime.tickBullets();
    }

    const bulletHitHazard = broadcast.find((event) => {
        return event.type === "bullet.resolved"
            && (event.payload as { reason?: string }).reason === "hit_hazard";
    });
    assert.ok(bulletHitHazard);
    const hazardRemoved = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { reason?: string }).reason === "cleared";
    });
    assert.ok(hazardRemoved);
});

test("bullet collision resolves against blocking terrain tiles", () => {
    const { runtime, broadcast } = makeHarness();
    runtime.getReadonlyState().blockingTiles.add("3,2");

    runtime.handleRawEvent("shooter", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("shooter", makeEnvelope("player.update", 2, {
        id: "shooter",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    runtime.handleRawEvent("shooter", makeEnvelope("bullet.fire.request", 3, {
        ownerId: "shooter",
        position: { x: 100, y: 100 },
        direction: 0,
        type: 0
    }));
    runtime.tickBullets();

    const hitTerrain = broadcast.find((event) => {
        return event.type === "bullet.resolved"
            && (event.payload as { reason?: string }).reason === "hit_terrain";
    });
    assert.ok(hitTerrain);
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

test("team chat is city-scoped while global chat is broadcast", () => {
    const { runtime, broadcast, direct } = makeHarness();

    runtime.handleRawEvent("city1-a", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("city1-b", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("city2-a", makeEnvelope("lobby.join.request", 3, { desiredCity: 2 }));

    runtime.handleRawEvent("city1-a", makeEnvelope("chat.message.request", 4, {
        text: "team-msg",
        scope: "team"
    }));
    runtime.handleRawEvent("city1-a", makeEnvelope("chat.message.request", 5, {
        text: "global-msg",
        scope: "global"
    }));

    const teamDeliveries = direct.filter((entry) => {
        if (entry.event.type !== "chat.message") {
            return false;
        }
        return (entry.event.payload as { text: string }).text === "team-msg";
    });
    assert.equal(teamDeliveries.length, 2);
    assert.ok(teamDeliveries.some((entry) => entry.socketId === "city1-a"));
    assert.ok(teamDeliveries.some((entry) => entry.socketId === "city1-b"));
    assert.ok(!teamDeliveries.some((entry) => entry.socketId === "city2-a"));

    const globalBroadcast = broadcast.filter((event) => {
        if (event.type !== "chat.message") {
            return false;
        }
        return (event.payload as { text: string }).text === "global-msg";
    });
    assert.equal(globalBroadcast.length, 1);
});

test("chat history excludes other-city team messages on join", () => {
    const { runtime, direct } = makeHarness();

    runtime.handleRawEvent("city1-a", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("city1-a", makeEnvelope("chat.message.request", 2, {
        text: "city1-team",
        scope: "team"
    }));
    runtime.handleRawEvent("city1-a", makeEnvelope("chat.message.request", 3, {
        text: "global-msg",
        scope: "global"
    }));

    runtime.handleRawEvent("city2-a", makeEnvelope("lobby.join.request", 4, { desiredCity: 2 }));

    const city2History = direct
        .filter((entry) => entry.socketId === "city2-a" && entry.event.type === "chat.history")
        .at(-1);
    assert.ok(city2History);
    const messages = city2History.event.payload as Array<{ text: string }>;
    assert.equal(messages.length, 1);
    assert.equal(messages[0]?.text, "global-msg");
});

test("lobby join hydrates score profile for bound user id", () => {
    const { runtime, direct } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, {
        desiredCity: 0,
        userId: "google:user-1"
    }));

    const profile = direct.find((entry) => entry.socketId === "p1" && entry.event.type === "score.profile");
    assert.ok(profile);
    assert.equal((profile.event.payload as { userId: string }).userId, "google:user-1");
    assert.equal((profile.event.payload as { score: number }).score, 0);
});

test("defense deploy is authoritative and emits spawn + finance update", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("p1", makeEnvelope("defense.deploy.request", 2, {
        cityId: 2,
        type: 8,
        tileX: 10,
        tileY: 10
    }));

    assert.equal(rejected.length, 0);
    const spawned = broadcast.find((event) => event.type === "defense.spawn");
    assert.ok(spawned);
    const finance = broadcast.filter((event) => event.type === "city.finance").at(-1);
    assert.ok(finance);
    assert.ok((finance.payload as { cash: number }).cash < 200);
});

test("defense deploy blocks occupied building footprint tiles but allows hospital bottom-row placement", () => {
    const { runtime, broadcast, rejected } = makeHarness({
        cityStartingCash: 1000
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 2,
        type: 300,
        tileX: 10,
        tileY: 10
    }));

    runtime.handleRawEvent("p1", makeEnvelope("defense.deploy.request", 3, {
        cityId: 2,
        type: 8,
        tileX: 11,
        tileY: 11
    }));
    runtime.handleRawEvent("p1", makeEnvelope("defense.deploy.request", 4, {
        cityId: 2,
        type: 8,
        tileX: 11,
        tileY: 12
    }));

    assert.equal(rejected.filter((entry) => entry.reason === "ValidationFailed").length >= 1, true);

    const spawned = broadcast.filter((event) => event.type === "defense.spawn");
    assert.equal(spawned.length, 1);
    const payload = spawned[0]?.payload as { tileX: number; tileY: number };
    assert.equal(payload.tileX, 11);
    assert.equal(payload.tileY, 12);
});

test("defense deploy blocks tiles occupied by active hazards", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("p1", makeEnvelope("hazard.deploy.request", 2, {
        cityId: 2,
        type: 3,
        position: { x: 480, y: 480 },
        radius: 64,
        damage: 10,
        fuseMs: 2000
    }));
    runtime.handleRawEvent("p1", makeEnvelope("defense.deploy.request", 3, {
        cityId: 2,
        type: 8,
        tileX: 10,
        tileY: 10
    }));

    assert.equal(broadcast.some((event) => event.type === "defense.spawn"), false);
    assert.equal(rejected.at(-1)?.reason, "ValidationFailed");
});

test("bullets can damage and remove defenses", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("defender", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("defender", makeEnvelope("defense.deploy.request", 3, {
        cityId: 1,
        type: 8,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("player.update", 4, {
        id: "attacker",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 420, y: 504 }
    }));

    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 5, {
        ownerId: "attacker",
        position: { x: 420, y: 504 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 6, {
        ownerId: "attacker",
        position: { x: 420, y: 504 },
        direction: 0,
        type: 2
    }));

    for (let i = 0; i < 8; i += 1) {
        runtime.tickBullets();
    }

    const updates = broadcast.filter((event) => event.type === "defense.update");
    assert.ok(updates.length >= 1);
    const latest = updates.at(-1);
    assert.ok(latest);
    assert.ok((latest.payload as { health: number }).health < 40);
});

test("orb drop clears target defenses and updates actor score profile", () => {
    const { runtime, broadcast, direct } = makeHarness({
        cityStartingCash: 1000
    });

    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 1, {
        desiredCity: 1,
        userId: "u-attacker"
    }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("target", makeEnvelope("defense.deploy.request", 3, {
        cityId: 2,
        type: 8,
        tileX: 7,
        tileY: 7
    }));
    runtime.handleRawEvent("target", makeEnvelope("building.place.request", 4, {
        ownerId: "target",
        cityId: 2,
        type: 300,
        tileX: 12,
        tileY: 12
    }));
    runtime.handleRawEvent("target", makeEnvelope("hazard.deploy.request", 5, {
        cityId: 2,
        type: 1,
        position: { x: 576, y: 576 },
        radius: 64,
        damage: 10,
        fuseMs: 5000
    }));

    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 6, {
        sourceCityId: 1,
        targetCityId: 2
    }));

    const defenseRemoved = broadcast.find((event) => event.type === "defense.remove");
    assert.ok(defenseRemoved);
    assert.equal((defenseRemoved.payload as { reason: string }).reason, "city_orbed");

    const profileUpdates = direct
        .filter((entry) => entry.socketId === "attacker" && entry.event.type === "score.profile")
        .map((entry) => entry.event.payload as { score: number });
    assert.ok(profileUpdates.length >= 2);
    assert.equal(profileUpdates.at(-1)?.score, 250);

    const buildingRemoved = broadcast.find((event) => event.type === "building.demolished");
    assert.ok(buildingRemoved);
    assert.equal((buildingRemoved.payload as { cityId: number }).cityId, 2);

    const hazardRemoved = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { reason?: string }).reason === "city_orbed";
    });
    assert.ok(hazardRemoved);
});

test("orb drop invokes notifier adapter with authoritative payload", async () => {
    const notifications: Array<{ playerId: string; sourceCityId: number; targetCityId: number }> = [];
    const { runtime } = makeHarness({}, {
        notifyOrbVictory: (playerId, sourceCityId, targetCityId) => {
            notifications.push({ playerId, sourceCityId, targetCityId });
            return Effect.void;
        }
    });

    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 1, {
        desiredCity: 1,
        userId: "u-attacker"
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 2, {
        sourceCityId: 1,
        targetCityId: 2
    }));

    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.playerId, "u-attacker");
    assert.equal(notifications[0]?.sourceCityId, 1);
    assert.equal(notifications[0]?.targetCityId, 2);
});
