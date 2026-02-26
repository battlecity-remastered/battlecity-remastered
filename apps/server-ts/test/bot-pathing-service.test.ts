import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { BinaryMinHeap, createBotPathContext, findBotPath } from "../src/domain/bots/BotPathingService.js";

const TILE = 48;

test("bot pathing context reuses blocked-grid build for repeated queries", () => {
    const state = createRuntimeState();
    const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        tileSize: TILE,
        mapMax: TILE * 128
    };

    state.buildings.set("wall_a", {
        id: "wall_a",
        ownerId: "x",
        cityId: 1,
        type: 300,
        tileX: 24,
        tileY: 24,
        health: 100,
        maxHealth: 100,
        population: 0
    });
    state.buildings.set("wall_b", {
        id: "wall_b",
        ownerId: "x",
        cityId: 1,
        type: 300,
        tileX: 28,
        tileY: 24,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    const context = createBotPathContext(state, config);

    const first = findBotPath(
        state,
        config,
        20 * TILE,
        20 * TILE,
        35 * TILE,
        30 * TILE,
        { searchRadiusTiles: 48, maxNodes: 10_000, context }
    );
    const second = findBotPath(
        state,
        config,
        20 * TILE,
        20 * TILE,
        35 * TILE,
        30 * TILE,
        { searchRadiusTiles: 48, maxNodes: 10_000, context }
    );

    assert.ok(first && first.length > 0);
    assert.ok(second && second.length > 0);
    assert.equal(context.stats.blockedSetBuilds, 1);
});

test("bot pathing with context preserves endpoint parity with direct pathing", () => {
    const state = createRuntimeState();
    const config = {
        ...DEFAULT_RUNTIME_CONFIG,
        tileSize: TILE,
        mapMax: TILE * 128
    };
    const context = createBotPathContext(state, config);

    const direct = findBotPath(
        state,
        config,
        4 * TILE,
        4 * TILE,
        30 * TILE,
        28 * TILE,
        { searchRadiusTiles: 64, maxNodes: 10_000 }
    );
    const cached = findBotPath(
        state,
        config,
        4 * TILE,
        4 * TILE,
        30 * TILE,
        28 * TILE,
        { searchRadiusTiles: 64, maxNodes: 10_000, context }
    );

    assert.ok(direct && direct.length > 0);
    assert.ok(cached && cached.length > 0);
    assert.deepEqual(cached.at(0), direct.at(0));
    assert.deepEqual(cached.at(-1), direct.at(-1));
});

test("binary heap maintains min-order with updates", () => {
    const heap = new BinaryMinHeap<{ id: string; score: number }>((left, right) => left.score - right.score);
    heap.push({ id: "c", score: 30 });
    heap.push({ id: "a", score: 10 });
    heap.push({ id: "b", score: 20 });
    const elevated = { id: "z", score: 100 };
    heap.push(elevated);
    elevated.score = 5;
    heap.update(elevated);

    assert.equal(heap.pop()?.id, "z");
    assert.equal(heap.pop()?.id, "a");
    assert.equal(heap.pop()?.id, "b");
    assert.equal(heap.pop()?.id, "c");
    assert.equal(heap.pop(), undefined);
});
