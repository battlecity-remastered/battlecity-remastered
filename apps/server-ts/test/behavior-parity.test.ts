import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState } from "../src/runtime/types.js";
import { UserStoreAdapter } from "../src/adapters/persistence/UserStoreAdapter.js";

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
    runtime.handleRawEvent("attacker", makeEnvelope("orb.drop.request", 2, {
        sourceCityId: 2,
        targetCityId: 3
    }));

    assert.equal(broadcast.some((event) => event.type === "city.orbed"), true);
    assert.equal(broadcast.some((event) => event.type === "score.promotion"), true);
});
