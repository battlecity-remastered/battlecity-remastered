import test from "node:test";
import assert from "node:assert/strict";
import { createClientState, updateFromSnapshot } from "../src/app/state.js";
import { resolveCitySpawn } from "../src/world/city-spawn.js";

test("client state defaults camera/local position to Balkh while not joined", () => {
    const state = createClientState();
    const balkh = resolveCitySpawn(0);

    assert.ok(balkh);
    assert.equal(state.local.id, null);
    assert.equal(state.local.city, 0);
    assert.equal(state.local.x, balkh?.x);
    assert.equal(state.local.y, balkh?.y);
});

test("players snapshot reconciles local position only when drift is meaningful", () => {
    const state = createClientState();
    state.local.id = "local_1";
    state.local.x = 100;
    state.local.y = 100;
    state.render.previousLocalX = 90;
    state.render.previousLocalY = 90;

    updateFromSnapshot(state, [{
        id: "local_1",
        city: 3,
        direction: 8,
        offset: { x: 106, y: 104 },
        health: 80,
        maxHealth: 100
    }]);

    assert.equal(state.local.x, 100);
    assert.equal(state.local.y, 100);
    assert.equal(state.local.city, 3);
    assert.equal(state.local.direction, 8);
    assert.equal(state.local.health, 80);
    assert.equal(state.local.maxHealth, 100);

    updateFromSnapshot(state, [{
        id: "local_1",
        city: 3,
        direction: 9,
        offset: { x: 140, y: 140 },
        health: 79,
        maxHealth: 100
    }]);

    assert.equal(state.local.x, 140);
    assert.equal(state.local.y, 140);
    assert.equal(state.render.previousLocalX, 140);
    assert.equal(state.render.previousLocalY, 140);
    assert.equal(state.render.projectedOffsetX, 0);
    assert.equal(state.render.projectedOffsetY, 0);
    assert.equal(state.render.lastResolvedAt, null);
});
