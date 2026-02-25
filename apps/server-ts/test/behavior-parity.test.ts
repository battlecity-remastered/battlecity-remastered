import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import citySpawnsJson from "../data/citySpawns.json" with { type: "json" };
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState } from "../src/runtime/types.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";

const ITEM_TYPE_ORB = 5;
const TILE_SIZE = 48;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const CITY_SPAWNS = citySpawnsJson as Record<string, { tileX?: number; tileY?: number }>;

const createBehaviorHarness = (config: { buildingCost?: number } = {}) => {
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
        userStore: new UserStoreAdapter()
    });

    return { runtime, broadcast, direct, rejected };
};

test("behavior: lobby->build->population flow emits authoritative updates", () => {
    const { runtime, broadcast, direct } = createBehaviorHarness({ buildingCost: 10 });

    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    runtime.handleRawEvent("recruit", makeEnvelope("lobby.join.request", 2, { desiredCity: 1 }));

    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 3, {
        ownerId: "mayor",
        cityId: 1,
        type: 300,
        tileX: 15,
        tileY: 15
    }));
    runtime.handleRawEvent("mayor", makeEnvelope("building.place.request", 4, {
        ownerId: "mayor",
        cityId: 1,
        type: 200,
        tileX: 16,
        tileY: 15
    }));

    for (let i = 0; i < 10; i += 1) {
        runtime.tickBullets();
    }

    assert.equal(direct.some((entry) => entry.socketId === "mayor" && entry.event.type === "lobby.assignment"), true);
    assert.equal(broadcast.some((event) => event.type === "building.placed"), true);
    assert.equal(broadcast.some((event) => event.type === "population.update"), true);
});

test("behavior: orb attack emits city.orbed and promotion events", () => {
    const { runtime, broadcast } = createBehaviorHarness();

    runtime.handleRawEvent("attacker", makeEnvelope("lobby.join.request", 1, { desiredCity: 2 }));
    const inventory = runtime.getReadonlyState().playerInventory.get("attacker") ?? new Map<number, number>();
    inventory.set(ITEM_TYPE_ORB, 1);
    runtime.getReadonlyState().playerInventory.set("attacker", inventory);
    runtime.getReadonlyState().buildings.set("cc_city3", {
        id: "cc_city3",
        ownerId: "city3",
        cityId: 3,
        type: 0,
        tileX: 20,
        tileY: 20,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    const targetSpawn = CITY_SPAWNS["3"];
    assert.ok(targetSpawn && Number.isFinite(targetSpawn.tileX) && Number.isFinite(targetSpawn.tileY));
    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 2, {
        sourceCityId: 2,
        targetCityId: 3,
        position: {
            x: Math.floor(targetSpawn!.tileX!) * TILE_SIZE,
            y: (Math.floor(targetSpawn!.tileY!) + COMMAND_CENTER_HEIGHT_TILES) * TILE_SIZE
        }
    }));

    assert.equal(broadcast.some((event) => event.type === "city.orbed"), true);
    assert.equal(broadcast.some((event) => event.type === "score.promotion"), true);
});
