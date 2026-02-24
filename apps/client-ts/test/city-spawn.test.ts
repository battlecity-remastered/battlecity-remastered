import test from "node:test";
import assert from "node:assert/strict";
import { resolveCitySpawn } from "../src/world/city-spawn.js";

test("resolveCitySpawn returns legacy spawn coordinates for runtime cities", () => {
    const city0 = resolveCitySpawn(0);
    const city7 = resolveCitySpawn(7);

    assert.ok(city0);
    assert.ok(city7);
    assert.equal(city0?.name, "Balkh");
    assert.equal(city7?.name, "Barentsburg");
    assert.equal(city0?.x, 1529.5);
    assert.equal(city0?.y, 1578.5);
    assert.equal(city7?.x, 23033.5);
    assert.equal(city7?.y, 1578.5);
});

test("resolveCitySpawn normalizes city id and rejects invalid input", () => {
    assert.equal(resolveCitySpawn(2.9)?.cityId, 2);
    assert.equal(resolveCitySpawn(Number.NaN), null);
    assert.equal(resolveCitySpawn(99), null);
});
