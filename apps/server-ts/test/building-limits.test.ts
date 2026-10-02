import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type KnownTypedEventEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState } from "../src/runtime/types.js";

const researchTypes = [400, 401, 402, 403, 404, 405, 406, 407, 409, 410, 411, 412, 413];

test("construction permits one of each non-housing type per city, rejects rapid duplicates without spending, and allows rebuilding", () => {
    for (const type of [0, 200, ...Array.from({ length: 13 }, (_, i) => 100 + i), ...researchTypes]) {
        const state = createRuntimeState(), denied: string[] = [];
        const runtime = new GameRuntime({ emitAll: () => {}, reject: () => {}, emitTo: (_id, event) => {
            const typed = event as KnownTypedEventEnvelope;
            if (typed.type === "build.denied") denied.push(typed.payload.reason);
        } }, { buildingCost: 10, rogueMaxBots: 0 }, state);
        let seq = 0;
        runtime.handleRawEvent("mayor", makeEnvelope("lobby.join.request", ++seq, { desiredCity: 2 }));
        runtime.handleRawEvent("other", makeEnvelope("lobby.join.request", ++seq, { desiredCity: 3 }));
        for (const city of [2, 3]) state.research.set(city, { completed: [...researchTypes] });
        const place = (ownerId: string, cityId: number, buildingType: number, tileX: number): void => {
            runtime.handleRawEvent(ownerId, makeEnvelope("building.place.request", ++seq, { ownerId, cityId, type: buildingType, tileX, tileY: 10 }));
        };
        place("mayor", 2, 300, 6);
        place("mayor", 2, type, 10);
        assert.deepEqual(denied, [], `first ${type} is permitted`);
        if (type >= 100 && type <= 112) state.factoryStock.set(2, new Map([[type - 100, 1]]));
        const original = [...state.buildings.values()].find(b => b.cityId === 2 && b.type === type)!;
        const cash = state.cities.get(2)!.cash, before = JSON.stringify([...state.buildings]);
        const stock = [...(state.factoryStock.get(2) ?? [])];
        place("mayor", 2, type, 14); place("mayor", 2, type, 18);
        assert.deepEqual(denied, ["building_already_exists", "building_already_exists"], `duplicate ${type}`);
        assert.equal(state.cities.get(2)!.cash, cash, "denial cannot charge the treasury");
        assert.equal(JSON.stringify([...state.buildings]), before, "denial cannot allocate population or add a building");
        assert.deepEqual([...(state.factoryStock.get(2) ?? [])], stock, "denial cannot reset or add factory stock");
        place("other", 3, type, 30);
        assert.equal(denied.length, 2, "another city has its own allowance");
        runtime.handleRawEvent("mayor", makeEnvelope("building.demolish.request", ++seq, { id: original.id, cityId: 2 }));
        assert.equal(state.buildings.has(original.id), false);
        place("mayor", 2, type, 10);
        assert.equal(denied.length, 2, "demolition restores the allowance");
        place("mayor", 2, 300, 14); place("mayor", 2, 300, 18);
        assert.equal(denied.length, 2, "housing remains repeatable");
        assert.equal([...state.buildings.values()].filter(b => b.cityId === 2 && b.type === 300).length, 3);
    }
});
