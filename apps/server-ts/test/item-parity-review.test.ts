import test from "node:test";
import assert from "node:assert/strict";
import { classicBulletDamage, classicBulletRange } from "@battlecity/sim-core";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { createBulletFromRequest, tickBullets } from "../src/runtime/bullet-runtime.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { useItem } from "../src/domain/items/ItemUseService.js";
import { resolveInventoryCap } from "../src/domain/inventory/InventoryService.js";
import { removeStructuresInBombRadius } from "../src/domain/hazards/hazard-bomb-structures.js";

const setup = () => {
    const state = createRuntimeState();
    state.players.set("pilot", { id: "pilot", city: 0, x: 1000, y: 1000, direction: 0, speed: 600, health: 40, maxHealth: 40 });
    state.playerInventory.set("pilot", new Map([[0, 4], [1, 4], [2, 5], [6, 4], [12, 4]]));
    const emitter = createRuntimeEmitter(state, { emitAll: () => {}, emitTo: () => {}, reject: () => {} });
    return { state, emitter };
};
test("all thirteen inventory caps match v0.0.79 shared/itemCaps.cjs", () => {
    const caps = [4, 4, 5, 20, 10, 1, 4, 5, 20, 10, 5, 5, 4];
    caps.forEach((cap, type) => assert.equal(resolveInventoryCap(type, DEFAULT_RUNTIME_CONFIG), cap, `item ${type}`));
});
test("classic damage and weapon ranges match the original authoritative BulletFactory", () => {
    assert.deepEqual([0, 1, 2, 3].map(classicBulletDamage), [5, 8, 5, 5]);
    assert.deepEqual([0, 1, 2, 3].map(classicBulletRange), [260, 340, 340, 48]);
});
test("laser, rocket and flare shots expire at their original ranges without consuming equipped weapons", () => {
    for (const [type, ticks, speed] of [[0, 4, 800], [1, 5, 800], [3, 5, 100]]) {
        const { state, emitter } = setup();
        state.players.set("distant", { id: "distant", city: 1, x: 1500, y: 1000, direction: 0, speed: 600, health: 40, maxHealth: 40 });
        const result = createBulletFromRequest(state, "pilot", { ownerId: "pilot", position: { x: 1024, y: 1024 }, direction: 0, type: type! }, DEFAULT_RUNTIME_CONFIG, () => 1);
        assert.equal(result.ok, true);
        if (!result.ok) throw Error("shot rejected");
        assert.equal(result.value.speed, speed);
        for (let tick = 0; tick < ticks! - 1; tick++) tickBullets(state, DEFAULT_RUNTIME_CONFIG, emitter);
        assert.equal(state.bullets.size, 1, `type ${type} remains active within range`);
        tickBullets(state, DEFAULT_RUNTIME_CONFIG, emitter);
        assert.equal(state.bullets.size, 0, `type ${type} stops at maximum range`);
        assert.equal(state.players.get("distant")?.health, 40);
        assert.deepEqual([...state.playerInventory.get("pilot")!], [[0, 4], [1, 4], [2, 5], [6, 4], [12, 4]]);
    }
});
test("cloak consumes one charge and lasts five seconds; frozen players cannot fire", () => {
    const { state } = setup(), before = Date.now();
    assert.equal(useItem(state, "pilot", { itemType: 0 }).ok, true);
    assert.equal(state.playerInventory.get("pilot")?.get(0), 3);
    const expiry = state.players.get("pilot")!.cloakedUntil!;
    assert.ok(expiry >= before + 5000 && expiry <= Date.now() + 5000);
    state.players.get("pilot")!.frozenUntil = Date.now() + 5000;
    assert.equal(createBulletFromRequest(state, "pilot", { ownerId: "pilot", direction: 0, type: 0, position: { x: 1024, y: 1024 } }, DEFAULT_RUNTIME_CONFIG, () => 1).ok, false);
});
test("command centres survive bombs even inside the blast while adjacent houses are destroyed", () => {
    const { state, emitter } = setup();
    for (const [id, type, tileX] of [["cc", 0, 10], ["house", 300, 11]] as const) state.buildings.set(id, {
        id, type, tileX, tileY: 10, cityId: 0, ownerId: "pilot", health: 120, maxHealth: 120, population: 0
    });
    removeStructuresInBombRadius(state, emitter, 10, 10);
    assert.equal(state.buildings.has("cc"), true);
    assert.equal(state.buildings.has("house"), false);
});
