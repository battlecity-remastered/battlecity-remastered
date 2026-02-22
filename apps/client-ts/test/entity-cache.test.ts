import test from "node:test";
import assert from "node:assert/strict";
import { reconcileEntityCache } from "../src/render/entity-cache.js";

test("reconcileEntityCache adds missing entities and removes stale entities", () => {
    const cache = new Map<string, string>([
        ["a", "entity-a"],
        ["b", "entity-b"]
    ]);
    const created: string[] = [];
    const removed: string[] = [];

    reconcileEntityCache(
        cache,
        ["b", "c"],
        (id) => {
            created.push(id);
            return `entity-${id}`;
        },
        (id) => {
            removed.push(id);
        }
    );

    assert.deepEqual(created, ["c"]);
    assert.deepEqual(removed, ["a"]);
    assert.equal(cache.get("b"), "entity-b");
    assert.equal(cache.get("c"), "entity-c");
    assert.equal(cache.has("a"), false);
});

test("reconcileEntityCache keeps existing entities when desired ids are unchanged", () => {
    const cache = new Map<string, { value: number }>([
        ["x", { value: 1 }]
    ]);
    const created: string[] = [];
    const removed: string[] = [];
    const original = cache.get("x");

    reconcileEntityCache(
        cache,
        ["x"],
        (id) => {
            created.push(id);
            return { value: 2 };
        },
        (id) => {
            removed.push(id);
        }
    );

    assert.deepEqual(created, []);
    assert.deepEqual(removed, []);
    assert.equal(cache.get("x"), original);
});
