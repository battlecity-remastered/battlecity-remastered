import test from "node:test";
import assert from "node:assert/strict";
import { initializeJoinedPlayer } from "../src/domain/spawn/CityBootstrap.js";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { makeEnvelope, type EventEnvelope } from "@battlecity/protocol";

const harness = () => {
    const broadcasts: EventEnvelope[] = [], direct: EventEnvelope[] = [], rejected: string[] = [];
    const runtime = new GameRuntime({ emitAll: event => { broadcasts.push(event); }, emitTo: (_id, event) => { direct.push(event); }, reject: (_id, reason) => { rejected.push(reason); } }, {}, undefined, { initializeJoinedPlayer });
    runtime.handleRawEvent("pilot", makeEnvelope("lobby.join.request", 1, { desiredCity: 0 }));
    const state = runtime.getReadonlyState(), player = state.players.get("pilot")!;
    state.playerInventory.set("pilot", new Map([[2, 2]]));
    return { runtime, state, player, broadcasts, direct, rejected };
};
test("medkits fully restore the authoritative hull and consume exactly one kit", () => {
    const { runtime, state, player, broadcasts, direct, rejected } = harness();
    state.players.set("pilot", { ...player, health: 5, maxHealth: 100 });
    runtime.handleRawEvent("pilot", makeEnvelope("item.use.request", 2, { itemType: 2 }));
    assert.equal(state.players.get("pilot")?.health, 100);
    assert.equal(state.playerInventory.get("pilot")?.get(2), 1);
    assert.deepEqual(broadcasts.findLast(event => event.type === "player.health")?.payload, {
        id: "pilot", health: 100, maxHealth: 100, source: "medkit"
    });
    assert.deepEqual(direct.findLast(event => event.type === "inventory.update")?.payload, {
        playerId: "pilot", items: [{ itemType: 2, count: 1 }]
    });
    assert.deepEqual(rejected, []);
});
test("healthy players retain their medkits; empty inventory cannot heal damaged tanks", () => {
    const { runtime, state, player, rejected } = harness();
    runtime.handleRawEvent("pilot", makeEnvelope("item.use.request", 2, { itemType: 2 }));
    assert.equal(state.playerInventory.get("pilot")?.get(2), 2);
    state.players.set("pilot", { ...player, health: 30 });
    state.playerInventory.set("pilot", new Map());
    runtime.handleRawEvent("pilot", makeEnvelope("item.use.request", 3, { itemType: 2 }));
    assert.equal(state.players.get("pilot")?.health, 30);
    assert.deepEqual(rejected, ["ResourceNotFound"]);
});
