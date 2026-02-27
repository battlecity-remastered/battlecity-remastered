import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { applyImportedCityLayout, parseCityImportFile } from "../src/world/city-import.js";

test("parseCityImportFile converts classic city rows into remastered tile coords/types", () => {
    const layout = parseCityImportFile([
        "6 510 509",
        "18 500 500",
        "1 0 0",
        "bad row"
    ].join("\n"));

    assert.equal(layout.length, 3);
    assert.deepEqual(layout[0], { type: 109, tileX: 1, tileY: 2 });
    assert.deepEqual(layout[1], { type: 101, tileX: 11, tileY: 11 });
    assert.deepEqual(layout[2], { type: 200, tileX: 511, tileY: 511 });
});

test("parseCityImportFile uses 511-raw transform parity on x/y coordinates", () => {
    const layout = parseCityImportFile([
        "1 511 511",
        "1 416 352"
    ].join("\n"));

    assert.deepEqual(layout[0], { type: 200, tileX: 0, tileY: 0 });
    assert.deepEqual(layout[1], { type: 200, tileX: 95, tileY: 159 });
});

test("applyImportedCityLayout replaces city-local objects and seeds imported buildings", () => {
    const state = createClientState();
    state.buildings.set("old-1", {
        id: "old-1",
        ownerId: "p1",
        cityId: 2,
        type: 109,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100,
        population: 1
    });
    state.defenses.set("d-1", {
        id: "d-1",
        cityId: 2,
        type: 8,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100
    });
    state.hazards.set("h-1", {
        id: "h-1",
        cityId: 2,
        type: 5,
        x: 100,
        y: 100,
        radius: 20
    });

    const imported = applyImportedCityLayout(state, 2, [
        { type: 300, tileX: 40, tileY: 41 },
        { type: 109, tileX: 42, tileY: 43 }
    ]);

    assert.equal(imported, 2);
    assert.equal(state.defenses.size, 0);
    assert.equal(state.hazards.size, 0);
    assert.equal(state.buildings.size, 2);
    assert.ok(state.buildings.has("import:2:0"));
    assert.ok(state.buildings.has("import:2:1"));
});
