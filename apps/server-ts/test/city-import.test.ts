import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, decodeKnownEnvelope } from "@battlecity/protocol";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { importCityLayout } from "../src/domain/map/CityImportService.js";
import { getOrCreateCity } from "../src/domain/economy/CityEconomyService.js";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { initializeJoinedPlayer } from "../src/domain/spawn/CityBootstrap.js";

const config = DEFAULT_RUNTIME_CONFIG;
const fixture = () => {
    const state = createRuntimeState(), events: ReturnType<typeof makeEnvelope>[] = [];
    state.socketCities.set("mayor", 1); state.socketRoles.set("mayor", "mayor");
    state.buildings.set("center", { id: "center", ownerId: "mayor", cityId: 1, type: 0, tileX: 30, tileY: 30, health: 120, maxHealth: 120, population: 0 });
    state.buildings.set("old", { id: "old", ownerId: "mayor", cityId: 1, type: 103, tileX: 33, tileY: 30, health: 120, maxHealth: 120, population: 0 });
    state.buildings.set("foreign", { id: "foreign", ownerId: "enemy", cityId: 2, type: 0, tileX: 50, tileY: 50, health: 120, maxHealth: 120, population: 0 });
    state.factoryStock.set(1, new Map([[3, 12]])); state.factoryProductionNextAtMs.set("old", 5000);
    state.playerInventory.set("mayor", new Map([[3, 5]]));
    const city = getOrCreateCity(state, 1, config); city.cash = 4321; city.score = 99; city.orbVictories = 4;
    const broadcaster = { emitAll: (event: ReturnType<typeof makeEnvelope>) => events.push(event), emitTo: (_id: string, event: ReturnType<typeof makeEnvelope>) => events.push(event), reject: (_id: string, reason: string) => assert.fail(reason) };
    return { state, events, emitter: createRuntimeEmitter(state, broadcaster), city };
};
const layout = { cityId: 63, baseTileX: 450, baseTileY: 450,
    layout: [{ type: 300, dx: 3, dy: 0 }, { type: 300, dx: 6, dy: 0 }, { type: 105, dx: 0, dy: 3 }, { type: 405, dx: 3, dy: 3 }],
    defenses: [{ type: "turret", dx: 1, dy: 2, angle: 35 }, { type: "mine", dx: 10, dy: 0 }, { type: "dfg", dx: 11, dy: 0 }, { type: "bomb", dx: 12, dy: 0 }, { type: "wall", dx: 13, dy: 0 }, { type: "sleeper", dx: 14, dy: 0 }, { type: "plasma", dx: 15, dy: 0 }] };

test("legacy builder JSON replaces only the current city, retains apron, population links and score history", () => {
    const { state, emitter, events, city } = fixture();
    state.buildBlockingTiles.add("31,32"); // Map placement mask includes the CC apron; driving mask does not.
    const result = importCityLayout(state, "mayor", JSON.stringify(layout), config, emitter);
    assert.equal(result.ok, true, result.message);
    const buildings = [...state.buildings.values()].filter(b => b.cityId === 1);
    assert.equal(buildings.length, 5); assert.equal(state.buildings.has("old"), false); assert.equal(state.buildings.has("foreign"), true);
    const center = buildings.find(b => b.type === 0)!;
    assert.deepEqual([center.tileX, center.tileY], [30, 30]);
    assert.ok(center.attachedHouseId); assert.ok(buildings.find(b => b.type === 105)!.attachedHouseId);
    assert.equal(city.cash, 4321); assert.equal(city.score, 99); assert.equal(city.orbVictories, 4);
    assert.equal(city.hadOrbFactory, true); assert.equal(state.factoryProductionNextAtMs.has("old"), false);
    assert.equal(state.factoryStock.has(1), false); assert.equal(state.playerInventory.get("mayor")!.has(3), false);
    assert.equal(state.defenses.size, 4); assert.equal([...state.defenses.values()].find(d => d.type === 9)!.orientation, 3);
    assert.equal([...state.hazards.values()].find(h => h.type === 3)!.armed, false);
    assert.equal([...state.hazards.values()].find(h => h.type === 4)!.active, true);
    assert.equal([...state.hazards.values()].find(h => h.type === 7)!.active, true);
    for (const event of events) assert.equal(decodeKnownEnvelope(event)._tag, "Right", event.type);
});

test("invalid JSON, types, bounds, terrain, duplicates and overlaps leave the existing city untouched", () => {
    for (const payload of ["nope", {}, { layout: [{ type: 999, dx: 0, dy: 0 }] }, { layout: [{ type: 300, dx: 0.5, dy: 0 }] },
        { layout: [{ type: 300, dx: -31, dy: 0 }] }, { layout: [{ type: 300, dx: 20, dy: 20 }] },
        { layout: [{ type: 105, dx: 3, dy: 0 }, { type: 105, dx: 6, dy: 0 }] },
        { layout: [{ type: 300, dx: 1, dy: 0 }] }, { layout: [{ type: 300, dx: 10, dy: 10 }] },
        { defenses: [{ type: "wall", dx: 0, dy: 0 }] }, { defenses: [{ type: "wall", dx: 10, dy: 0 }, { type: "mine", dx: 10, dy: 0 }] }]) {
        const { state, emitter, events } = fixture(); state.buildBlockingTiles.add("40,40");
        const before = structuredClone(state);
        assert.equal(importCityLayout(state, "mayor", typeof payload === "string" ? payload : JSON.stringify(payload), config, emitter).ok, false);
        assert.deepEqual(state, before); assert.equal(events.length, 0);
    }
});

test("unjoined players and recruits cannot replace a city", () => {
    const { state, emitter } = fixture(), before = structuredClone(state);
    assert.equal(importCityLayout(state, "outsider", JSON.stringify(layout), config, emitter).ok, false);
    state.socketRoles.set("mayor", "recruit"); before.socketRoles.set("mayor", "recruit");
    assert.equal(importCityLayout(state, "mayor", JSON.stringify(layout), config, emitter).ok, false);
    assert.deepEqual(state, before);
});

test("live request returns a typed result to the mayor and broadcasts imported buildings to peers", () => {
    const state = createRuntimeState(), all: ReturnType<typeof makeEnvelope>[] = [], replies: ReturnType<typeof makeEnvelope>[] = [];
    const runtime = new GameRuntime({ emitAll: event => all.push(event), emitTo: (_id, event) => replies.push(event), reject: (_id, reason) => assert.fail(reason) }, {}, state, { initializeJoinedPlayer });
    runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", 1, { desiredCity: 1 }));
    all.length = 0; replies.length = 0;
    runtime.handleRawEvent("mayor", makeEnvelope("city.layout.import.request", 2, { json: JSON.stringify({ layout: [{ type: 0, dx: 0, dy: 0 }] }) }));
    const result = replies.find(e => e.type === "city.layout.result")!;
    assert.ok(result); assert.equal((result.payload as { ok: boolean }).ok, true);
    assert.ok(all.some(e => e.type === "building.placed")); assert.ok(all.some(e => e.type === "building.demolished"));
    for (const event of [...all, ...replies]) assert.equal(decodeKnownEnvelope(event)._tag, "Right", event.type);
});
