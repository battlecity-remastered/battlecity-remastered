import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
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
