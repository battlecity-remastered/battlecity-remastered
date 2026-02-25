import test from "node:test";
import assert from "node:assert/strict";
import { deployHazard } from "../src/domain/hazards/HazardService.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";

const ITEM_TYPE_BOMB = 3;
const TILE_SIZE = 48;

const makePayload = (x: number, y: number) => {
    return {
        cityId: 1,
        type: ITEM_TYPE_BOMB,
        position: { x, y },
        armed: true
    };
};

test("deployHazard rejects drops inside housing footprint", () => {
    const state = createRuntimeState();
    state.playerInventory.set("owner", new Map([[ITEM_TYPE_BOMB, 1]]));
    state.buildings.set("housing_1", {
        id: "housing_1",
        ownerId: "owner",
        cityId: 1,
        type: 300,
        tileX: 6,
        tileY: 6,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    const result = deployHazard(
        state,
        "owner",
        1,
        makePayload(6 * TILE_SIZE, 6 * TILE_SIZE),
        () => 1,
        DEFAULT_RUNTIME_CONFIG
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
        assert.equal(result.reason, "hazard_invalid");
    }
    assert.equal(state.hazards.size, 0);
    assert.equal(state.playerInventory.get("owner")?.get(ITEM_TYPE_BOMB) ?? 0, 1);
});

test("deployHazard allows drops on command center bay row", () => {
    const state = createRuntimeState();
    state.playerInventory.set("owner", new Map([[ITEM_TYPE_BOMB, 1]]));
    state.buildings.set("cc_1", {
        id: "cc_1",
        ownerId: "owner",
        cityId: 1,
        type: 0,
        tileX: 10,
        tileY: 10,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    const result = deployHazard(
        state,
        "owner",
        1,
        makePayload(11 * TILE_SIZE, 12 * TILE_SIZE),
        () => 1,
        DEFAULT_RUNTIME_CONFIG
    );

    assert.equal(result.ok, true);
    if (result.ok) {
        assert.equal(result.value.hazard.position.x, 11 * TILE_SIZE);
        assert.equal(result.value.hazard.position.y, 12 * TILE_SIZE);
    }
    assert.equal(state.playerInventory.get("owner")?.get(ITEM_TYPE_BOMB) ?? 0, 0);
    assert.equal(state.hazards.size, 1);
});
