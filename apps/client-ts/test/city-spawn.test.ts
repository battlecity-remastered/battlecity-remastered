import test from "node:test";
import assert from "node:assert/strict";
import { getCityDisplayName, listCitySpawns, resolveCitySpawn } from "../src/world/city-spawn.js";

test("resolveCitySpawn returns classic spawn coordinates for runtime cities", () => {
    const city0 = resolveCitySpawn(0);
    const city7 = resolveCitySpawn(7);
    const city56 = resolveCitySpawn(56);
    const city63 = resolveCitySpawn(63);

    assert.ok(city0);
    assert.ok(city7);
    assert.ok(city56);
    assert.ok(city63);
    assert.equal(city0?.name, "Balkh");
    assert.equal(city7?.name, "Barentsburg");
    assert.equal(city56?.name, "Tirana");
    assert.equal(city63?.name, "Admin Inn");
    assert.equal(city0?.tileX, 31);
    assert.equal(city7?.tileX, 479);
    assert.equal(city56?.tileX, 31);
    assert.equal(city63?.tileX, 478);
    assert.equal(city0?.x, 1529.5);
    assert.equal(city0?.y, 1578.5);
    assert.equal(city7?.x, 23033.5);
    assert.equal(city7?.y, 1578.5);
    assert.equal(city56?.x, 1529.5);
    assert.equal(city56?.y, 23082.5);
    assert.equal(city63?.x, 22985.5);
    assert.equal(city63?.y, 23082.5);
});

test("resolveCitySpawn normalizes city id and rejects invalid input", () => {
    assert.equal(resolveCitySpawn(2.9)?.cityId, 2);
    assert.equal(resolveCitySpawn(Number.NaN), null);
    assert.equal(resolveCitySpawn(99), null);
});

test("city spawn table covers full 0..63 and preserves final-row x shift", () => {
    const spawns = listCitySpawns();
    assert.equal(spawns.length, 64);
    assert.equal(spawns[0]?.cityId, 0);
    assert.equal(spawns[63]?.cityId, 63);

    const finalRow = spawns.slice(56, 64).map((spawn) => spawn.tileX);
    assert.deepEqual(finalRow, [31, 94, 158, 222, 286, 350, 414, 478]);
});

test("getCityDisplayName resolves known and fallback city labels", () => {
    assert.equal(getCityDisplayName(0), "Balkh");
    assert.equal(getCityDisplayName(7), "Barentsburg");
    assert.equal(getCityDisplayName(99), "City 100");
});
