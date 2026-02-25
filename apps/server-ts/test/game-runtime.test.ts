import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import { Effect } from "effect";
import citySpawnsJson from "../data/citySpawns.json" with { type: "json" };
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";
import { createRuntimeState, type RuntimeConfig } from "../src/runtime/types.js";

const ITEM_TYPE_LASER = 12;
const ITEM_TYPE_BOMB = 3;
const ITEM_TYPE_MINE = 4;
const ITEM_TYPE_ORB = 5;
const ITEM_TYPE_DFG = 7;
const TILE_SIZE = 48;
const COMMAND_CENTER_HEIGHT_TILES = 2;

const CITY_SPAWNS = citySpawnsJson as Record<string, { tileX?: number; tileY?: number }>;

const makeHarness = (
    config: Partial<RuntimeConfig> = {},
    runtimeServices: {
        notifyOrbVictory?: (playerId: string, sourceCityId: number, targetCityId: number) => Effect.Effect<void>;
    } = {},
    stateInit: {
        fakeCityIds?: number[];
        blockingTiles?: Set<string>;
        buildBlockingTiles?: Set<string>;
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
    }, config, createRuntimeState(stateInit), {
        userStore: new UserStoreAdapter(),
        ...runtimeServices
    });

    return { runtime, broadcast, direct, rejected };
};

const grantInventoryItem = (runtime: GameRuntime, socketId: string, itemType: number, count = 1): void => {
    const state = runtime.getReadonlyState();
    const inventory = state.playerInventory.get(socketId) ?? new Map<number, number>();
    inventory.set(itemType, count);
    state.playerInventory.set(socketId, inventory);
};

const makeOrbDropPayload = (
    sourceCityId: number,
    targetCityId: number
): { sourceCityId: number; targetCityId: number; position: { x: number; y: number; }; } => {
    const spawn = CITY_SPAWNS[String(targetCityId)];
    if (!spawn || !Number.isFinite(spawn.tileX) || !Number.isFinite(spawn.tileY)) {
        throw new Error(`Missing city spawn for target city ${targetCityId}`);
    }
    return {
        sourceCityId,
        targetCityId,
        position: {
            x: Math.floor(spawn.tileX) * TILE_SIZE,
            y: (Math.floor(spawn.tileY) + COMMAND_CENTER_HEIGHT_TILES) * TILE_SIZE
        }
    };
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

test("late join hydrates existing world entities and economy state", () => {
    const { runtime, broadcast, direct } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 1,
        direction: 4,
        isMoving: false,
        offset: { x: 320, y: 320 }
    }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 3, {
        ownerId: "s1",
        cityId: 1,
        type: 300,
        tileX: 8,
        tileY: 8
    }));

    const state = runtime.getReadonlyState();
    const placedBuildingEvent = broadcast.find((event) => event.type === "building.placed");
    assert.ok(placedBuildingEvent);
    const placedBuildingId = (placedBuildingEvent.payload as { id: string }).id;
    const placedBuilding = state.buildings.get(placedBuildingId);
    assert.ok(placedBuilding);
    placedBuilding.population = 25;

    state.hazards.set("hz_seed", {
        id: "hz_seed",
        ownerId: "s1",
        cityId: 1,
        type: 3,
        x: 430,
        y: 410,
        radius: 96,
        damage: 35,
        remainingMs: 1500,
        armed: true,
        active: true
    });
    state.defenses.set("def_seed", {
        id: "def_seed",
        cityId: 1,
        type: 8,
        tileX: 10,
        tileY: 10,
        health: 90,
        maxHealth: 100
    });
    state.bullets.set("bullet_seed", {
        id: "bullet_seed",
        ownerId: "s1",
        city: 1,
        x: 420,
        y: 400,
        direction: 8,
        speed: 900,
        type: 0
    });
    state.factoryStock.set(1, new Map<number, number>([[12, 3]]));
    state.research.set(1, {
        active: {
            researchType: 413,
            remainingMs: 900
        },
        completed: [412]
    });
    const city = state.cities.get(1);
    assert.ok(city);
    city.cash = 1234;
    city.income = 56;
    city.score = 78;
    city.researchLevel = 2;

    runtime.handleRawEvent("s2", makeEnvelope("lobby.join.request", 4, { desiredCity: 2 }));

    const directToJoiner = direct
        .filter((entry) => entry.socketId === "s2")
        .map((entry) => entry.event);

    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "building.placed") {
            return false;
        }
        return (event.payload as { id: string }).id === placedBuildingId;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "population.update") {
            return false;
        }
        const payload = event.payload as { id: string; population: number };
        return payload.id === placedBuildingId && payload.population === 25;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "hazard.spawn") {
            return false;
        }
        const payload = event.payload as { id: string; active?: boolean };
        return payload.id === "hz_seed" && payload.active === true;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "defense.spawn") {
            return false;
        }
        return (event.payload as { id: string }).id === "def_seed";
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "bullet.fired") {
            return false;
        }
        return (event.payload as { id: string }).id === "bullet_seed";
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "factory.stock") {
            return false;
        }
        const payload = event.payload as { cityId: number; itemType: number; stock: number };
        return payload.cityId === 1 && payload.itemType === 12 && payload.stock === 3;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "city.finance") {
            return false;
        }
        const payload = event.payload as { cityId: number; cash: number; income: number; score: number; researchLevel: number };
        return payload.cityId === 1
            && payload.cash === 1234
            && payload.income === 56
            && payload.score === 78
            && payload.researchLevel === 2;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "research.update") {
            return false;
        }
        const payload = event.payload as {
            cityId: number;
            completed: number[];
            active?: { researchType: number; remainingMs: number };
        };
        return payload.cityId === 1
            && payload.completed.includes(412)
            && payload.active?.researchType === 413;
    }));
    assert.ok(directToJoiner.some((event) => {
        if (event.type !== "players.snapshot") {
            return false;
        }
        const payload = event.payload as Array<{ id: string }>;
        return payload.some((entry) => entry.id === "s1");
    }));
});

test("join hydration includes fake-city finance payloads outside configured cityCount", () => {
    const { runtime, direct } = makeHarness({
        cityCount: 8
    }, {}, {
        fakeCityIds: [17]
    });
    const state = runtime.getReadonlyState();
    state.cities.set(17, {
        cityId: 17,
        cash: 777,
        income: 33,
        score: 12,
        researchLevel: 1,
        orbCount: 1
    });
    state.buildings.set("fake-cc-17", {
        id: "fake-cc-17",
        ownerId: "fake_city_17",
        cityId: 17,
        type: 0,
        tileX: 220,
        tileY: 180,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    runtime.handleRawEvent("joiner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));

    const directToJoiner = direct
        .filter((entry) => entry.socketId === "joiner")
        .map((entry) => entry.event);
    const fakeFinance = directToJoiner.find((event) => {
        if (event.type !== "city.finance") {
            return false;
        }
        return (event.payload as { cityId: number }).cityId === 17;
    });
    assert.ok(fakeFinance);
    assert.equal((fakeFinance.payload as { cash: number }).cash, 777);
    assert.equal((fakeFinance.payload as { isOrbable?: boolean }).isOrbable, true);
});

test("player.update throttle supports reverse movement", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 2,
        direction: 0,
        isMoving: true,
        throttle: -1,
        offset: { x: 100, y: 100 }
    }));

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length >= 2);
    const lastSnapshot = snapshots.at(-1);
    assert.ok(lastSnapshot);

    const players = lastSnapshot.payload as Array<{ id: string; offset: { x: number; y: number } }>;
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "s1");
    assert.ok((players[0]?.offset.y ?? 100) > 100);
});

test("player.update movement respects blocking terrain tiles", () => {
    const { runtime, broadcast } = makeHarness({}, {}, {
        blockingTiles: new Set(["3,2"])
    });

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 2,
        direction: 8,
        isMoving: true,
        offset: { x: 130, y: 120 }
    }));

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length >= 2);
    const lastSnapshot = snapshots.at(-1);
    assert.ok(lastSnapshot);

    const players = lastSnapshot.payload as Array<{ id: string; offset: { x: number; y: number } }>;
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "s1");
    assert.ok((players[0]?.offset.x ?? 999) < (3 * 48));
});

test("player.update allows bottom-row movement through factory/cc/hospital families", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 2, {
        ownerId: "s1",
        cityId: 2,
        type: 100,
        tileX: 2,
        tileY: 2
    }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 3, {
        id: "s1",
        city: 2,
        direction: 8,
        isMoving: true,
        offset: { x: 70, y: 200 }
    }));

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length >= 2);
    const lastSnapshot = snapshots.at(-1);
    assert.ok(lastSnapshot);
    const players = lastSnapshot.payload as Array<{ id: string; offset: { x: number; y: number } }>;
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "s1");
    assert.ok((players[0]?.offset.x ?? 0) > 70);
});

test("player.update blocks bottom-row movement through non-drive-through building families", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("s1", makeEnvelope("building.place.request", 2, {
        ownerId: "s1",
        cityId: 2,
        type: 300,
        tileX: 2,
        tileY: 2
    }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 3, {
        id: "s1",
        city: 2,
        direction: 8,
        isMoving: true,
        offset: { x: 70, y: 200 }
    }));

    const snapshots = broadcast.filter((event) => event.type === "players.snapshot");
    assert.ok(snapshots.length >= 2);
    const lastSnapshot = snapshots.at(-1);
    assert.ok(lastSnapshot);
    const players = lastSnapshot.payload as Array<{ id: string; offset: { x: number; y: number } }>;
    assert.equal(players.length, 1);
    assert.equal(players[0]?.id, "s1");
    assert.ok((players[0]?.offset.x ?? 999) <= 70);
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
    const { runtime, broadcast } = makeHarness({}, {}, {
        blockingTiles: new Set<string>(),
        buildBlockingTiles: new Set<string>()
    });

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
        position: { x: 536, y: 536 },
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
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 7, {
        ownerId: "attacker",
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 8, {
        ownerId: "attacker",
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));

    for (let i = 0; i < 20; i += 1) {
        runtime.tickBullets();
    }

    const deadEvents = broadcast.filter((event) => event.type === "player.dead");
    assert.ok(deadEvents.some((event) => (event.payload as { id: string }).id === "target"));
});

test("player death releases lobby assignment and blocks movement updates until rejoin", () => {
    const { runtime, broadcast, rejected } = makeHarness();

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
    grantInventoryItem(runtime, "target", ITEM_TYPE_LASER, 1);

    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 5, {
        ownerId: "attacker",
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 6, {
        ownerId: "attacker",
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 7, {
        ownerId: "attacker",
        position: { x: 536, y: 536 },
        direction: 0,
        type: 2
    }));

    for (let i = 0; i < 20; i += 1) {
        runtime.tickBullets();
    }

    assert.ok(broadcast.some((event) => {
        return event.type === "player.dead" && (event.payload as { id: string }).id === "target";
    }));
    assert.ok(broadcast.some((event) => {
        return event.type === "player.removed" && (event.payload as { id: string }).id === "target";
    }));
    assert.ok(broadcast.some((event) => {
        return event.type === "lobby.released" && (event.payload as { id: string }).id === "target";
    }));

    const stateAfterDeath = runtime.getReadonlyState();
    assert.equal(stateAfterDeath.players.has("target"), false);
    assert.equal(stateAfterDeath.socketCities.has("target"), false);
    assert.equal(stateAfterDeath.socketRoles.has("target"), false);
    assert.equal(stateAfterDeath.playerInventory.has("target"), false);

    const latestLobbySnapshot = broadcast
        .filter((event) => event.type === "lobby.snapshot")
        .at(-1);
    assert.ok(latestLobbySnapshot);
    const city2 = (latestLobbySnapshot.payload as Array<{ city: number; mayorId?: string; recruitCount: number }>)
        .find((entry) => entry.city === 2);
    assert.ok(city2);
    assert.equal(city2?.mayorId, undefined);

    runtime.handleRawEvent("target", makeEnvelope("player.update", 8, {
        id: "target",
        city: 2,
        direction: 0,
        isMoving: true,
        offset: { x: 610, y: 512 }
    }));

    assert.ok(rejected.some((entry) => entry.reason === "ResourceNotFound"));
    assert.equal(runtime.getReadonlyState().players.has("target"), false);
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

    const city = runtime.getReadonlyState().cities.get(1);
    assert.ok(city);
    if (city) {
        city.cash = 0;
    }

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 7, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 14,
        tileY: 14
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "insufficient_funds");

    assert.ok(rejected.filter((entry) => entry.reason === "ValidationFailed").length >= 3);
    assert.ok(rejected.some((entry) => entry.reason === "InsufficientFunds"));
});

test("factory placement waits for research completion after research building population is full", () => {
    const { runtime, broadcast, direct } = makeHarness({
        buildingCost: 10,
        researchDurationMs: 250
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 407,
        tileX: 8,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 12,
        tileY: 8
    }));
    assert.equal((direct.at(-1)?.event.payload as { reason?: string } | undefined)?.reason, "research_required");

    const researchBuilding = broadcast
        .filter((event) => event.type === "building.placed")
        .map((event) => event.payload as { id: string; type: number })
        .find((payload) => payload.type === 407);
    assert.ok(researchBuilding);
    const research = runtime.getReadonlyState().buildings.get(researchBuilding?.id ?? "");
    assert.ok(research);
    if (research) {
        research.population = 50;
    }

    for (let i = 0; i < 4; i += 1) {
        runtime.tickBullets();
    }

    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 4, {
        ownerId: "p1",
        cityId: 1,
        type: 107,
        tileX: 12,
        tileY: 8
    }));

    const placedBuildings = broadcast
        .filter((event) => event.type === "building.placed")
        .map((event) => event.payload as { type: number });
    assert.ok(placedBuildings.some((payload) => payload.type === 407));
    assert.ok(placedBuildings.some((payload) => payload.type === 107));
});

test("building placement rejects terrain-blocked housing footprint", () => {
    const { runtime, broadcast, direct } = makeHarness({}, {}, {
        blockingTiles: new Set(["11,11"])
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 10,
        tileY: 10
    }));

    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "building_collision");
    assert.equal(broadcast.filter((event) => event.type === "building.placed").length, 0);
});

test("building placement uses placement blocking set when terrain is passable for movement", () => {
    const { runtime, broadcast, direct } = makeHarness({}, {}, {
        blockingTiles: new Set(["10,10", "10,11"]),
        buildBlockingTiles: new Set(["10,10", "10,11", "10,12"])
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 10,
        tileY: 12
    }));

    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "building_collision");
    assert.equal(broadcast.filter((event) => event.type === "building.placed").length, 0);
});

test("building placement chain distance uses euclidean radius like legacy server", () => {
    const { runtime, broadcast, direct } = makeHarness({ buildingCost: 10 });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 30,
        tileY: 30
    }));

    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "build_too_far");
    assert.equal(broadcast.filter((event) => event.type === "building.placed").length, 1);
});

test("building placement rejects overlapping footprint even with different top-left tile", () => {
    const { runtime, broadcast, direct } = makeHarness({ buildingCost: 10 });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 11,
        tileY: 10
    }));

    assert.equal((direct.at(-1)?.event.payload as { reason: string }).reason, "building_collision");
    assert.equal(broadcast.filter((event) => event.type === "building.placed").length, 1);
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

test("bullet fire requires matching inventory for laser/rocket shots", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("s1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("s1", makeEnvelope("player.update", 2, {
        id: "s1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 64, y: 64 }
    }));
    runtime.handleRawEvent("s1", makeEnvelope("bullet.fire.request", 3, {
        ownerId: "s1",
        position: { x: 64, y: 64 },
        direction: 0,
        type: 0
    }));

    assert.equal(broadcast.some((event) => event.type === "bullet.fired"), false);
    assert.equal(rejected.length, 1);
    assert.equal(rejected[0]?.reason, "ResourceNotFound");
});

test("bullet fire ignores spoofed far-away spawn coordinates", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 400, y: 500 }
    }));
    grantInventoryItem(runtime, "p1", ITEM_TYPE_LASER, 1);

    runtime.handleRawEvent("p1", makeEnvelope("bullet.fire.request", 3, {
        ownerId: "p1",
        position: { x: 9000, y: 9000 },
        direction: 0,
        type: 0
    }));

    const fired = broadcast.find((event) => event.type === "bullet.fired");
    assert.ok(fired);
    const position = (fired.payload as { position: { x: number; y: number } }).position;
    assert.equal(position.x, 424);
    assert.equal(position.y, 524);
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

test("lobby join emits player leaderboard snapshot", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, {
        desiredCity: 1,
        userId: "u1",
        callsign: "Pilot One"
    }));

    const leaderboardEvents = broadcast.filter((event) => event.type === "lobby.high_scores");
    assert.ok(leaderboardEvents.length >= 1);
    const latest = leaderboardEvents.at(-1);
    assert.ok(latest);
    const scores = latest.payload as Array<{ userId: string; name: string; points: number; rankTitle: string }>;
    assert.equal(scores.length, 1);
    assert.equal(scores[0]?.userId, "u1");
    assert.equal(scores[0]?.name, "Pilot One");
    assert.equal(scores[0]?.points, 0);
    assert.equal(scores[0]?.rankTitle, "Private");
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

test("player update is relocated to nearest safe offset when colliding with building footprint", () => {
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
        offset: { x: 500, y: 500 }
    }));

    const player = runtime.getReadonlyState().players.get("mayor");
    assert.ok(player);
    assert.notEqual(player.x, 500);
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
    const { runtime, broadcast, direct } = makeHarness({
        buildingCost: 10,
        factoryProductionTickMs: 100
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 400,
        tileX: 8,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 100,
        tileX: 9,
        tileY: 8
    }));

    const factory = [...runtime.getReadonlyState().buildings.values()].find((building) => building.cityId === 1 && building.type === 100);
    assert.ok(factory);
    factory.population = 50;

    for (let i = 0; i < 6; i += 1) {
        runtime.tickBullets();
    }

    runtime.handleRawEvent("p1", makeEnvelope("factory.collect.request", 4, {
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

test("factory laser stock is capped at legacy limit", () => {
    const { runtime, broadcast } = makeHarness({
        buildingCost: 10,
        factoryProductionTickMs: 100,
        factoryStockCap: 99
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 300,
        tileX: 7,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 412,
        tileX: 8,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 4, {
        ownerId: "p1",
        cityId: 1,
        type: 112,
        tileX: 9,
        tileY: 8
    }));

    const house = [...runtime.getReadonlyState().buildings.values()].find((building) => building.cityId === 1 && building.type === 300);
    assert.ok(house);
    const laserFactory = [...runtime.getReadonlyState().buildings.values()].find((building) => building.cityId === 1 && building.type === 112);
    assert.ok(laserFactory);
    laserFactory.population = 50;
    laserFactory.attachedHouseId = house.id;

    for (let i = 0; i < 20; i += 1) {
        runtime.tickBullets();
    }

    const laserStockEvents = broadcast.filter((event) => {
        if (event.type !== "factory.stock") {
            return false;
        }
        const payload = event.payload as { cityId: number; itemType: number; stock: number };
        return payload.cityId === 1 && payload.itemType === 12;
    });
    assert.ok(laserStockEvents.length > 0);
    const latest = laserStockEvents.at(-1)?.payload as { stock: number } | undefined;
    assert.equal(latest?.stock, 4);
});

test("icon pickup request decrements stock and updates inventory", () => {
    const { runtime, broadcast, direct } = makeHarness({
        buildingCost: 10,
        factoryProductionTickMs: 100
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 400,
        tileX: 8,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 100,
        tileX: 9,
        tileY: 8
    }));

    const factory = [...runtime.getReadonlyState().buildings.values()].find((building) => building.cityId === 1 && building.type === 100);
    assert.ok(factory);
    factory.population = 50;

    for (let i = 0; i < 6; i += 1) {
        runtime.tickBullets();
    }
    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 4, {
        cityId: 1,
        itemType: 0,
        amount: 1
    }));

    assert.ok(broadcast.some((event) => event.type === "factory.stock"));
    assert.ok(direct.some((entry) => entry.event.type === "icon.pickup.confirmed"));
    assert.ok(direct.some((entry) => entry.event.type === "inventory.update"));
});

test("icon pickup does not decrement stock when player inventory is at cap", () => {
    const { runtime, rejected, direct } = makeHarness({
        buildingCost: 10,
        factoryProductionTickMs: 100
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 2, {
        ownerId: "p1",
        cityId: 1,
        type: 400,
        tileX: 8,
        tileY: 8
    }));
    runtime.handleRawEvent("p1", makeEnvelope("building.place.request", 3, {
        ownerId: "p1",
        cityId: 1,
        type: 100,
        tileX: 9,
        tileY: 8
    }));

    const factory = [...runtime.getReadonlyState().buildings.values()].find((building) => building.cityId === 1 && building.type === 100);
    assert.ok(factory);
    factory.population = 50;

    for (let i = 0; i < 6; i += 1) {
        runtime.tickBullets();
    }

    const before = runtime.getReadonlyState().factoryStock.get(1)?.get(0) ?? 0;
    assert.ok(before > 0);
    grantInventoryItem(runtime, "p1", 0, 4);

    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 4, {
        cityId: 1,
        itemType: 0,
        amount: 1
    }));

    const after = runtime.getReadonlyState().factoryStock.get(1)?.get(0) ?? 0;
    assert.equal(after, before);
    assert.equal(direct.some((entry) => entry.event.type === "icon.pickup.confirmed"), false);
    assert.ok(rejected.some((entry) => entry.reason === "ResourceNotFound"));
});

test("icon pickup can recover nearby friendly hazards and restore inventory", () => {
    const { runtime, broadcast, direct, rejected } = makeHarness();
    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 144, y: 144 }
    }));

    const player = runtime.getReadonlyState().players.get("p1");
    assert.ok(player);
    grantInventoryItem(runtime, "p1", ITEM_TYPE_BOMB, 1);

    runtime.handleRawEvent("p1", makeEnvelope("hazard.deploy.request", 3, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
        position: { x: player.x, y: player.y },
        armed: false
    }));
    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 4, {
        cityId: 1,
        itemType: ITEM_TYPE_BOMB,
        amount: 1
    }));

    const removed = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { reason?: string }).reason === "cleared";
    });
    assert.ok(removed);
    const inventory = direct
        .filter((entry) => entry.socketId === "p1" && entry.event.type === "inventory.update")
        .at(-1);
    assert.ok(inventory);
    const bombCount = (inventory.event.payload as { items: Array<{ itemType: number; count: number }> })
        .items
        .find((item) => item.itemType === ITEM_TYPE_BOMB)
        ?.count ?? 0;
    assert.equal(bombCount, 1);
    assert.equal(rejected.length, 0);
});

test("icon pickup consumes nearby dropped icon before touching factory stock", () => {
    const { runtime, broadcast, rejected } = makeHarness();
    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 240, y: 240 }
    }));

    // Simulate existing city stock of the same item type to guard against stock-first duplication.
    runtime.getReadonlyState().factoryStock.set(1, new Map<number, number>([
        [ITEM_TYPE_LASER, 3]
    ]));

    grantInventoryItem(runtime, "p1", ITEM_TYPE_LASER, 1);
    runtime.handleRawEvent("p1", makeEnvelope("hazard.deploy.request", 3, {
        cityId: 1,
        type: ITEM_TYPE_LASER,
        position: { x: 240, y: 240 }
    }));

    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 4, {
        cityId: 1,
        itemType: ITEM_TYPE_LASER,
        amount: 1
    }));

    const stockAfterFirstPickup = runtime.getReadonlyState().factoryStock.get(1)?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(stockAfterFirstPickup, 3);
    assert.equal(runtime.getReadonlyState().hazards.size, 0);

    const removed = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { reason?: string }).reason === "cleared";
    });
    assert.ok(removed);

    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 5, {
        cityId: 1,
        itemType: ITEM_TYPE_LASER,
        amount: 1
    }));

    const inventoryCount = runtime.getReadonlyState().playerInventory.get("p1")?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(inventoryCount, 1);
    assert.ok(rejected.some((entry) => entry.reason === "ResourceNotFound"));
});

test("icon pickup from dropped map icon grants only one item regardless of requested amount", () => {
    const { runtime } = makeHarness();
    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 240, y: 240 }
    }));

    grantInventoryItem(runtime, "p1", ITEM_TYPE_LASER, 1);
    runtime.handleRawEvent("p1", makeEnvelope("hazard.deploy.request", 3, {
        cityId: 1,
        type: ITEM_TYPE_LASER,
        position: { x: 240, y: 240 }
    }));
    runtime.handleRawEvent("p1", makeEnvelope("icon.pickup.request", 4, {
        cityId: 1,
        itemType: ITEM_TYPE_LASER,
        amount: 4
    }));

    const inventoryCount = runtime.getReadonlyState().playerInventory.get("p1")?.get(ITEM_TYPE_LASER) ?? 0;
    assert.equal(inventoryCount, 1);
});

test("medkit use heals player and consumes inventory", () => {
    const { runtime, direct, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 3, {
        id: "target",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    grantInventoryItem(runtime, "owner", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
        position: { x: 220, y: 220 },
        radius: 120,
        damage: 20,
        fuseMs: 100
    }));
    runtime.tickBullets();
    runtime.tickBullets();

    grantInventoryItem(runtime, "target", 2, 1);
    runtime.handleRawEvent("target", makeEnvelope("item.use.request", 6, {
        itemType: 2
    }));

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.ok(healthEvents.some((event) => (event.payload as { source?: string }).source === "medkit"));
    const inv = direct.filter((entry) => entry.socketId === "target" && entry.event.type === "inventory.update").at(-1);
    assert.ok(inv);
    const items = (inv.event.payload as { items: Array<{ itemType: number; count: number }> }).items;
    assert.equal(items.some((item) => item.itemType === 2), false);
    assert.equal(rejected.length, 0);
});

test("cloak use consumes cloak inventory without medkit healing", () => {
    const { runtime, direct, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 2, {
        id: "target",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    const player = runtime.getReadonlyState().players.get("target");
    assert.ok(player);
    runtime.getReadonlyState().players.set("target", {
        ...player,
        health: 50
    });
    grantInventoryItem(runtime, "target", 0, 1);
    runtime.handleRawEvent("target", makeEnvelope("item.use.request", 3, {
        itemType: 0
    }));

    const cloakEvent = broadcast.find((event) => {
        if (event.type !== "player.health") {
            return false;
        }
        const payload = event.payload as { id?: string; source?: string; health?: number };
        return payload.id === "target" && payload.source === "cloak" && payload.health === 50;
    });
    assert.ok(cloakEvent);
    const inventory = direct
        .filter((entry) => entry.socketId === "target" && entry.event.type === "inventory.update")
        .at(-1);
    assert.ok(inventory);
    const items = (inventory.event.payload as { items: Array<{ itemType: number; count: number }> }).items;
    assert.equal(items.some((item) => item.itemType === 0), false);
    assert.equal(rejected.length, 0);
});

test("hospital repair strip heals players standing inside the bay", () => {
    const { runtime, broadcast } = makeHarness();
    const hospitalTileX = 12;
    const hospitalTileY = 12;

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 3 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 3 }));
    runtime.handleRawEvent("owner", makeEnvelope("building.place.request", 3, {
        ownerId: "owner",
        cityId: 3,
        type: 200,
        tileX: hospitalTileX,
        tileY: hospitalTileY
    }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 4, {
        id: "target",
        city: 3,
        direction: 0,
        isMoving: false,
        offset: { x: hospitalTileX * TILE_SIZE, y: (hospitalTileY + 2) * TILE_SIZE }
    }));

    const targetBefore = runtime.getReadonlyState().players.get("target");
    assert.ok(targetBefore);
    runtime.getReadonlyState().players.set("target", {
        ...targetBefore,
        health: 80
    });

    runtime.tickBullets();

    const hospitalHealth = broadcast.find((event) => {
        if (event.type !== "player.health") {
            return false;
        }
        const payload = event.payload as { id?: string; source?: string };
        return payload.id === "target" && payload.source === "hospital";
    });
    assert.ok(hospitalHealth);
    const targetAfter = runtime.getReadonlyState().players.get("target");
    assert.ok(targetAfter);
    assert.equal(targetAfter?.health, 82);
});

test("hospital healing does not apply outside the repair strip", () => {
    const { runtime, broadcast } = makeHarness();
    const hospitalTileX = 12;
    const hospitalTileY = 12;

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 3 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 3 }));
    runtime.handleRawEvent("owner", makeEnvelope("building.place.request", 3, {
        ownerId: "owner",
        cityId: 3,
        type: 200,
        tileX: hospitalTileX,
        tileY: hospitalTileY
    }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 4, {
        id: "target",
        city: 3,
        direction: 0,
        isMoving: false,
        offset: { x: (hospitalTileX - 1) * TILE_SIZE, y: (hospitalTileY + 2) * TILE_SIZE }
    }));

    const targetBefore = runtime.getReadonlyState().players.get("target");
    assert.ok(targetBefore);
    runtime.getReadonlyState().players.set("target", {
        ...targetBefore,
        health: 80
    });

    runtime.tickBullets();

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.equal(healthEvents.some((event) => (event.payload as { source?: string }).source === "hospital"), false);
    const targetAfter = runtime.getReadonlyState().players.get("target");
    assert.ok(targetAfter);
    assert.equal(targetAfter?.health, 80);
});

test("hazard deploy detonates and damages nearby players", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("target", makeEnvelope("player.update", 3, {
        id: "target",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 220, y: 220 }
    }));
    grantInventoryItem(runtime, "owner", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
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

test("mine hazards only trigger on enemy players", () => {
    const { runtime, broadcast } = makeHarness();
    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("ally", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("enemy", makeEnvelope("lobby.join.request", 3, { desiredCity: 2 }));

    runtime.handleRawEvent("ally", makeEnvelope("player.update", 4, {
        id: "ally",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 240, y: 240 }
    }));
    runtime.handleRawEvent("enemy", makeEnvelope("player.update", 5, {
        id: "enemy",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 240, y: 240 }
    }));
    grantInventoryItem(runtime, "owner", 4, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 6, {
        cityId: 1,
        type: 4,
        position: { x: 240, y: 240 }
    }));
    runtime.tickBullets();

    const healthEvents = broadcast.filter((event) => event.type === "player.health");
    assert.ok(healthEvents.some((event) => (event.payload as { id?: string }).id === "enemy"));
    assert.equal(healthEvents.some((event) => (event.payload as { id?: string }).id === "ally"), false);
});

test("dfg hazards freeze enemy players and expire after reveal window", () => {
    const { runtime, broadcast } = makeHarness();
    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("enemy", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("enemy", makeEnvelope("player.update", 3, {
        id: "enemy",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 240, y: 240 }
    }));
    grantInventoryItem(runtime, "owner", ITEM_TYPE_DFG, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: ITEM_TYPE_DFG,
        position: { x: 240, y: 240 }
    }));

    runtime.tickBullets();

    const enemy = runtime.getReadonlyState().players.get("enemy");
    assert.ok(enemy);
    assert.ok((enemy.frozenUntil ?? 0) > Date.now());
    const dfgHazard = Array.from(runtime.getReadonlyState().hazards.values())
        .find((hazard) => hazard.type === ITEM_TYPE_DFG);
    assert.ok(dfgHazard);
    assert.equal(dfgHazard?.armed, false);
    assert.equal(dfgHazard?.active, false);
    const revealSpawn = broadcast.find((event) => {
        if (event.type !== "hazard.spawn") {
            return false;
        }
        const payload = event.payload as { id?: string; active?: boolean };
        return payload.id === dfgHazard?.id && payload.active === false;
    });
    assert.ok(revealSpawn);

    for (let i = 0; i < 8; i += 1) {
        runtime.tickBullets();
    }

    assert.equal(Array.from(runtime.getReadonlyState().hazards.values())
        .some((hazard) => hazard.type === ITEM_TYPE_DFG), false);
    const removed = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { reason?: string }).reason === "expired";
    });
    assert.ok(removed);
});

test("bomb detonation destroys nearby buildings and defenses but not command centers", () => {
    const { runtime, broadcast } = makeHarness();
    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("target", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.getReadonlyState().buildings.set("target_housing", {
        id: "target_housing",
        ownerId: "target",
        cityId: 2,
        type: 300,
        tileX: 6,
        tileY: 6,
        health: 120,
        maxHealth: 120,
        population: 30
    });
    runtime.getReadonlyState().buildings.set("target_cc", {
        id: "target_cc",
        ownerId: "target",
        cityId: 2,
        type: 0,
        tileX: 8,
        tileY: 8,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    runtime.getReadonlyState().defenses.set("target_defense", {
        id: "target_defense",
        cityId: 2,
        type: 8,
        tileX: 7,
        tileY: 7,
        health: 100,
        maxHealth: 100
    });
    grantInventoryItem(runtime, "owner", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 3, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
        position: { x: 6 * TILE_SIZE, y: 6 * TILE_SIZE },
        armed: true,
        fuseMs: 100
    }));

    runtime.tickBullets();
    runtime.tickBullets();

    assert.equal(runtime.getReadonlyState().buildings.has("target_housing"), false);
    assert.equal(runtime.getReadonlyState().buildings.has("target_cc"), true);
    assert.equal(runtime.getReadonlyState().defenses.has("target_defense"), false);
    assert.ok(broadcast.some((event) => {
        if (event.type !== "building.demolished") {
            return false;
        }
        return (event.payload as { id?: string }).id === "target_housing";
    }));
    assert.ok(broadcast.some((event) => {
        if (event.type !== "defense.remove") {
            return false;
        }
        return (event.payload as { id?: string; reason?: string }).id === "target_defense"
            && (event.payload as { reason?: string }).reason === "destroyed";
    }));
});

test("active bombs detonate when the owner dies", () => {
    const { runtime, broadcast } = makeHarness();
    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("enemy", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("owner", makeEnvelope("player.update", 3, {
        id: "owner",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE }
    }));

    grantInventoryItem(runtime, "owner", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
        position: { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE },
        armed: true,
        fuseMs: 5_000
    }));

    const owner = runtime.getReadonlyState().players.get("owner");
    assert.ok(owner);
    runtime.getReadonlyState().players.set("owner", {
        ...owner,
        health: 20
    });

    runtime.handleRawEvent("owner", makeEnvelope("player.bot_damage", 5, {
        shooterId: "enemy",
        amount: 40
    }));

    assert.equal(Array.from(runtime.getReadonlyState().hazards.values())
        .some((hazard) => hazard.type === ITEM_TYPE_BOMB), false);
    assert.ok(broadcast.some((event) => {
        if (event.type !== "hazard.remove") {
            return false;
        }
        return (event.payload as { reason?: string }).reason === "detonated";
    }));
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
    grantInventoryItem(runtime, "enemy", ITEM_TYPE_LASER, 1);
    grantInventoryItem(runtime, "owner", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 4, {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
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
    const stockRestored = broadcast.find((event) => {
        if (event.type !== "factory.stock") {
            return false;
        }
        const payload = event.payload as { cityId: number; itemType: number; stock: number };
        return payload.cityId === 1 && payload.itemType === ITEM_TYPE_BOMB && payload.stock === 1;
    });
    assert.ok(stockRestored);
});

test("dropping non-hazard inventory item creates passive map icon without auto-detonation", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    grantInventoryItem(runtime, "owner", ITEM_TYPE_LASER, 1);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 2, {
        cityId: 1,
        type: ITEM_TYPE_LASER,
        position: { x: 240, y: 240 }
    }));

    assert.equal(rejected.length, 0);
    const spawned = broadcast.find((event) => {
        if (event.type !== "hazard.spawn") {
            return false;
        }
        return (event.payload as { type: number }).type === ITEM_TYPE_LASER;
    });
    assert.ok(spawned);
    const hazardId = (spawned.payload as { id: string }).id;
    assert.ok(runtime.getReadonlyState().hazards.has(hazardId));

    for (let i = 0; i < 8; i += 1) {
        runtime.tickBullets();
    }

    assert.ok(runtime.getReadonlyState().hazards.has(hazardId));
    const removed = broadcast.find((event) => {
        return event.type === "hazard.remove"
            && (event.payload as { id?: string }).id === hazardId;
    });
    assert.equal(removed, undefined);
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
    grantInventoryItem(runtime, "shooter", ITEM_TYPE_LASER, 1);
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

test("high-speed bullets do not tunnel through blocked terrain tiles", () => {
    const { runtime, broadcast } = makeHarness({ bulletSpeed: 1800 });
    runtime.getReadonlyState().blockingTiles.add("3,2");

    runtime.handleRawEvent("shooter", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("shooter", makeEnvelope("player.update", 2, {
        id: "shooter",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    grantInventoryItem(runtime, "shooter", ITEM_TYPE_LASER, 1);
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

test("high-speed bullets do not tunnel through building footprints", () => {
    const { runtime, broadcast } = makeHarness({ bulletSpeed: 1800 });

    runtime.handleRawEvent("shooter", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("shooter", makeEnvelope("player.update", 2, {
        id: "shooter",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    grantInventoryItem(runtime, "shooter", ITEM_TYPE_LASER, 1);
    runtime.getReadonlyState().buildings.set("target_building", {
        id: "target_building",
        ownerId: "enemy",
        cityId: 2,
        type: 300,
        tileX: 3,
        tileY: 2,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    runtime.handleRawEvent("shooter", makeEnvelope("bullet.fire.request", 3, {
        ownerId: "shooter",
        position: { x: 100, y: 100 },
        direction: 0,
        type: 0
    }));
    runtime.tickBullets();

    const hitBuilding = broadcast.find((event) => {
        return event.type === "bullet.resolved"
            && (event.payload as { reason?: string }).reason === "hit_building";
    });
    assert.ok(hitBuilding);
    const building = runtime.getReadonlyState().buildings.get("target_building");
    assert.equal(building?.health, 100);
});

test("high-speed bullets do not tunnel through hazard hitboxes", () => {
    const { runtime, broadcast } = makeHarness({ bulletSpeed: 1800 });

    runtime.handleRawEvent("shooter", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("shooter", makeEnvelope("player.update", 2, {
        id: "shooter",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 100, y: 100 }
    }));
    grantInventoryItem(runtime, "shooter", ITEM_TYPE_LASER, 1);
    runtime.getReadonlyState().hazards.set("target_hazard", {
        id: "target_hazard",
        ownerId: "enemy",
        cityId: 2,
        type: ITEM_TYPE_MINE,
        x: 3 * TILE_SIZE,
        y: 2 * TILE_SIZE,
        radius: 96,
        damage: 20,
        remainingMs: 5000,
        armed: true,
        active: true
    });

    runtime.handleRawEvent("shooter", makeEnvelope("bullet.fire.request", 3, {
        ownerId: "shooter",
        position: { x: 100, y: 100 },
        direction: 0,
        type: 0
    }));
    runtime.tickBullets();

    const hitHazard = broadcast.find((event) => {
        return event.type === "bullet.resolved"
            && (event.payload as { reason?: string }).reason === "hit_hazard";
    });
    assert.ok(hitHazard);
    assert.equal(runtime.getReadonlyState().hazards.has("target_hazard"), false);
});

test("orb drop emits city.orbed and score.promotion", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    grantInventoryItem(runtime, "p1", ITEM_TYPE_ORB, 1);
    runtime.getReadonlyState().buildings.set("cc_city2", {
        id: "cc_city2",
        ownerId: "p2",
        cityId: 2,
        type: 0,
        tileX: 10,
        tileY: 10,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    runtime.handleRawEvent("p1", makeEnvelope("orb.drop.request", 2, makeOrbDropPayload(1, 2)));

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

test("defense deploy from inventory consumes stock and does not require city cash", () => {
    const { runtime, broadcast, direct, rejected } = makeHarness({
        cityStartingCash: 0
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    grantInventoryItem(runtime, "p1", 9, 1);
    const financeBefore = broadcast.filter((event) => event.type === "city.finance").length;

    runtime.handleRawEvent("p1", makeEnvelope("defense.deploy.request", 2, {
        cityId: 2,
        type: 9,
        tileX: 10,
        tileY: 10,
        fromInventory: true
    }));

    assert.equal(rejected.length, 0);
    const spawned = broadcast.find((event) => event.type === "defense.spawn");
    assert.ok(spawned);
    assert.equal((spawned.payload as { type: number }).type, 9);

    const inventoryUpdate = direct
        .filter((entry) => entry.socketId === "p1" && entry.event.type === "inventory.update")
        .at(-1);
    assert.ok(inventoryUpdate);
    const items = (inventoryUpdate.event.payload as { items: Array<{ itemType: number; count: number }> }).items;
    assert.equal(items.some((item) => item.itemType === 9), false);

    const financeAfter = broadcast.filter((event) => event.type === "city.finance").length;
    assert.equal(financeAfter, financeBefore);
});

test("deployed turret tracks enemy players and fires authoritatively", () => {
    const { runtime, broadcast } = makeHarness({
        botTickMs: 100,
        fakeCityPlayerThreshold: 999
    }, {}, {
        blockingTiles: new Set<string>(),
        buildBlockingTiles: new Set<string>()
    });

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("enemy", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("owner", makeEnvelope("defense.deploy.request", 3, {
        cityId: 1,
        type: 9,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("enemy", makeEnvelope("player.update", 4, {
        id: "enemy",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 560, y: 480 }
    }));

    for (let i = 0; i < 12; i += 1) {
        runtime.tickBullets();
    }

    const defenseSpawn = broadcast.find((event) => event.type === "defense.spawn");
    assert.ok(defenseSpawn);
    const defenseId = (defenseSpawn.payload as { id: string }).id;

    const orientationUpdate = broadcast.find((event) => {
        if (event.type !== "defense.update") {
            return false;
        }
        const payload = event.payload as { id: string; orientation?: number };
        return payload.id === defenseId && typeof payload.orientation === "number";
    });
    assert.ok(orientationUpdate);

    const defensiveShot = broadcast.find((event) => {
        if (event.type !== "bullet.fired") {
            return false;
        }
        const payload = event.payload as { ownerId: string; direction: number };
        return payload.ownerId === defenseId && payload.direction === 0;
    });
    assert.ok(defensiveShot);

    const enemyHit = broadcast.find((event) => {
        if (event.type !== "player.health") {
            return false;
        }
        const payload = event.payload as { id: string; source?: string };
        return payload.id === "enemy" && payload.source === "bullet";
    });
    assert.ok(enemyHit);
});

test("deployed turret does not fire at same-city players", () => {
    const { runtime, broadcast } = makeHarness({
        botTickMs: 100,
        fakeCityPlayerThreshold: 999
    });

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("ally", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));
    runtime.handleRawEvent("owner", makeEnvelope("defense.deploy.request", 3, {
        cityId: 1,
        type: 9,
        tileX: 10,
        tileY: 10
    }));
    runtime.handleRawEvent("ally", makeEnvelope("player.update", 4, {
        id: "ally",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 560, y: 480 }
    }));

    for (let i = 0; i < 8; i += 1) {
        runtime.tickBullets();
    }

    const defenseSpawn = broadcast.find((event) => event.type === "defense.spawn");
    assert.ok(defenseSpawn);
    const defenseId = (defenseSpawn.payload as { id: string }).id;

    const defensiveShot = broadcast.find((event) => {
        if (event.type !== "bullet.fired") {
            return false;
        }
        const payload = event.payload as { ownerId: string };
        return payload.ownerId === defenseId;
    });
    assert.equal(defensiveShot, undefined);
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
    grantInventoryItem(runtime, "p1", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("p1", makeEnvelope("hazard.deploy.request", 2, {
        cityId: 2,
        type: ITEM_TYPE_BOMB,
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

test("bullet destroying defense restores city stock for that defense type", () => {
    const { runtime, broadcast, rejected } = makeHarness();

    runtime.handleRawEvent("defender", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 2, { desiredCity: 2 }));
    runtime.handleRawEvent("defender", makeEnvelope("defense.deploy.request", 3, {
        cityId: 1,
        type: 8,
        tileX: 10,
        tileY: 10
    }));

    const defenseSpawn = broadcast.find((event) => event.type === "defense.spawn");
    assert.ok(defenseSpawn);
    const defenseId = (defenseSpawn.payload as { id: string }).id;
    const defense = runtime.getReadonlyState().defenses.get(defenseId);
    assert.ok(defense);
    defense.health = 1;

    runtime.handleRawEvent("attacker", makeEnvelope("player.update", 4, {
        id: "attacker",
        city: 2,
        direction: 0,
        isMoving: false,
        offset: { x: 420, y: 504 }
    }));
    grantInventoryItem(runtime, "attacker", ITEM_TYPE_LASER, 1);
    runtime.handleRawEvent("attacker", makeEnvelope("bullet.fire.request", 5, {
        ownerId: "attacker",
        position: { x: 420, y: 504 },
        direction: 0,
        type: 0
    }));

    for (let i = 0; i < 6; i += 1) {
        runtime.tickBullets();
    }

    assert.equal(rejected.length, 0);
    const defenseRemoved = broadcast.find((event) => {
        return event.type === "defense.remove"
            && (event.payload as { id?: string; reason?: string }).id === defenseId
            && (event.payload as { reason?: string }).reason === "destroyed";
    });
    assert.ok(defenseRemoved);
    const stockRestored = broadcast.find((event) => {
        if (event.type !== "factory.stock") {
            return false;
        }
        const payload = event.payload as { cityId: number; itemType: number; stock: number };
        return payload.cityId === 1 && payload.itemType === 8 && payload.stock === 1;
    });
    assert.ok(stockRestored);
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
    runtime.getReadonlyState().buildings.set("cc_city2", {
        id: "cc_city2",
        ownerId: "target",
        cityId: 2,
        type: 0,
        tileX: 12,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    grantInventoryItem(runtime, "attacker", ITEM_TYPE_ORB, 1);
    grantInventoryItem(runtime, "target", ITEM_TYPE_BOMB, 1);
    runtime.handleRawEvent("target", makeEnvelope("hazard.deploy.request", 5, {
        cityId: 2,
        type: ITEM_TYPE_BOMB,
        position: { x: 576, y: 576 },
        radius: 64,
        damage: 10,
        fuseMs: 5000
    }));

    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 6, makeOrbDropPayload(1, 2)));

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
    grantInventoryItem(runtime, "attacker", ITEM_TYPE_ORB, 1);
    runtime.getReadonlyState().buildings.set("cc_city2", {
        id: "cc_city2",
        ownerId: "target",
        cityId: 2,
        type: 0,
        tileX: 12,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 2, makeOrbDropPayload(1, 2)));

    await new Promise<void>((resolve) => {
        setTimeout(resolve, 0);
    });

    assert.equal(notifications.length, 1);
    assert.equal(notifications[0]?.playerId, "u-attacker");
    assert.equal(notifications[0]?.sourceCityId, 1);
    assert.equal(notifications[0]?.targetCityId, 2);
});

test("fake city activates under low population and spawns defender bots", () => {
    const { runtime, broadcast } = makeHarness({
        cityCount: 50,
        botTickMs: 50,
        fakeCityDefendersPerCity: 1,
        fakeCityPlayerThreshold: 10
    }, {}, {
        fakeCityIds: [17]
    });

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 17 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 17,
        direction: 0,
        isMoving: false,
        offset: { x: 4600, y: 7600 }
    }));
    runtime.tickBullets();
    runtime.tickBullets();

    const state = runtime.getReadonlyState();
    assert.equal(state.fakeCities.get(17)?.active, true);
    const fakeCityBuildings = Array.from(state.buildings.values()).filter((building) => building.cityId === 17);
    // Legacy parity: city 17 (Annaba) uses curated .city layouts (36 buildings) rather than generic template fallback.
    assert.ok(fakeCityBuildings.length >= 35);
    assert.ok(Array.from(state.players.values()).some((player) => player.isBot && player.botType === "defender"));
    assert.ok(broadcast.some((event) => event.type === "players.snapshot"));
});

test("orbing a fake city applies cooldown and removes its defender bots", () => {
    const { runtime } = makeHarness({
        cityCount: 50,
        botTickMs: 50,
        fakeCityDefendersPerCity: 1,
        fakeCityPlayerThreshold: 10
    }, {}, {
        fakeCityIds: [17]
    });

    runtime.handleRawEvent("seed", makeEnvelope("lobby.join.request", 1, { desiredCity: 17 }));
    runtime.handleRawEvent("seed", makeEnvelope("player.update", 2, {
        id: "seed",
        city: 17,
        direction: 0,
        isMoving: false,
        offset: { x: 4600, y: 7600 }
    }));
    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 3, { desiredCity: 1 }));
    grantInventoryItem(runtime, "attacker", ITEM_TYPE_ORB, 1);
    runtime.tickBullets();
    runtime.tickBullets();
    const defenderBefore = Array.from(runtime.getReadonlyState().players.values())
        .filter((player) => player.botType === "defender").length;
    assert.ok(defenderBefore >= 1);

    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 4, makeOrbDropPayload(1, 17)));

    const state = runtime.getReadonlyState();
    assert.equal(state.fakeCities.get(17)?.active, false);
    assert.ok((state.fakeCities.get(17)?.cooldownUntil ?? 0) > Date.now());
    assert.equal(Array.from(state.players.values()).some((player) => player.botType === "defender"), false);
});

test("rogue bots spawn against developed non-fake cities", () => {
    const { runtime } = makeHarness({
        cityCount: 50,
        botTickMs: 50,
        rogueBuildingThreshold: 2,
        rogueMaxBots: 1
    });

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    const mutableState = runtime.getReadonlyState() as unknown as {
        buildings: Map<string, { cityId: number; id: string }>;
    };
    mutableState.buildings.set("seed_a", { id: "seed_a", cityId: 2 });
    mutableState.buildings.set("seed_b", { id: "seed_b", cityId: 2 });

    runtime.tickBullets();
    runtime.tickBullets();

    const state = runtime.getReadonlyState();
    const rogue = Array.from(state.players.values()).find((player) => player.isBot && player.botType === "rogue");
    assert.ok(rogue);
    assert.equal(rogue?.health, 20);
    assert.equal(rogue?.maxHealth, 20);
});

test("mine hazards damage and can destroy rogue bots", () => {
    const { runtime, broadcast } = makeHarness({
        cityCount: 50,
        botTickMs: 50,
        rogueBuildingThreshold: 2,
        rogueMaxBots: 1,
        botMoveSpeed: 0
    });

    runtime.handleRawEvent("owner", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    const mutableState = runtime.getReadonlyState() as unknown as {
        buildings: Map<string, { cityId: number; id: string }>;
    };
    mutableState.buildings.set("seed_a", { id: "seed_a", cityId: 2 });
    mutableState.buildings.set("seed_b", { id: "seed_b", cityId: 2 });

    runtime.tickBullets();
    runtime.tickBullets();

    const rogue = Array.from(runtime.getReadonlyState().players.values())
        .find((player) => player.isBot && player.botType === "rogue");
    assert.ok(rogue);

    grantInventoryItem(runtime, "owner", ITEM_TYPE_MINE, 2);
    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 2, {
        cityId: 2,
        type: ITEM_TYPE_MINE,
        position: {
            x: (rogue?.x ?? 0) + 24,
            y: (rogue?.y ?? 0) + 24
        }
    }));

    runtime.tickBullets();

    const rogueAfterFirstMine = runtime.getReadonlyState().players.get(rogue?.id ?? "");
    assert.ok(rogueAfterFirstMine);
    assert.ok((rogueAfterFirstMine?.health ?? 0) < (rogue?.health ?? 0));

    runtime.handleRawEvent("owner", makeEnvelope("hazard.deploy.request", 3, {
        cityId: 2,
        type: ITEM_TYPE_MINE,
        position: {
            x: (rogueAfterFirstMine?.x ?? 0) + 24,
            y: (rogueAfterFirstMine?.y ?? 0) + 24
        }
    }));
    runtime.tickBullets();

    assert.equal(runtime.getReadonlyState().players.has(rogue?.id ?? ""), false);
    assert.ok(broadcast.some((event) => {
        if (event.type !== "player.dead") {
            return false;
        }
        return (event.payload as { id?: string }).id === rogue?.id;
    }));
});

test("player:bot_damage legacy alias applies authoritative health updates", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 512, y: 512 }
    }));

    runtime.handleRawEvent("p1", makeEnvelope("player:bot_damage", 3, {
        amount: 20,
        sourceType: "defender_bot",
        shooterId: "defender_1_1",
        bulletType: 0
    }));

    const healthEvent = broadcast
        .filter((event) => event.type === "player.health")
        .at(-1);
    assert.ok(healthEvent);
    assert.equal((healthEvent.payload as { health: number }).health, 80);
});

test("player.bot_damage fatal damage evicts player from active city", () => {
    const { runtime, broadcast } = makeHarness();

    runtime.handleRawEvent("p1", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("p1", makeEnvelope("player.update", 2, {
        id: "p1",
        city: 1,
        direction: 0,
        isMoving: false,
        offset: { x: 512, y: 512 }
    }));

    runtime.handleRawEvent("p1", makeEnvelope("player.bot_damage", 3, { amount: 40, shooterId: "defender_1_1" }));
    runtime.handleRawEvent("p1", makeEnvelope("player.bot_damage", 4, { amount: 40, shooterId: "defender_1_1" }));
    runtime.handleRawEvent("p1", makeEnvelope("player.bot_damage", 5, { amount: 40, shooterId: "defender_1_1" }));

    assert.ok(broadcast.some((event) => {
        return event.type === "player.dead" && (event.payload as { id: string }).id === "p1";
    }));
    assert.ok(broadcast.some((event) => {
        return event.type === "lobby.released" && (event.payload as { id: string }).id === "p1";
    }));
    assert.equal(runtime.getReadonlyState().players.has("p1"), false);
    assert.equal(runtime.getReadonlyState().socketCities.has("p1"), false);
});
