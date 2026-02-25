import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { formatNearestOrbableCityLine, resolveNearestOrbableCity } from "../src/render/orb-target.js";

test("resolveNearestOrbableCity picks closest enemy command center and reports direction", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 480;
    state.local.y = 480;

    state.buildings.set("local-cc", {
        id: "local-cc",
        ownerId: "self",
        cityId: 0,
        type: 0,
        tileX: 9,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    state.buildings.set("enemy-cc-near", {
        id: "enemy-cc-near",
        ownerId: "enemy-1",
        cityId: 1,
        type: 0,
        tileX: 14,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    state.buildings.set("enemy-cc-far", {
        id: "enemy-cc-far",
        ownerId: "enemy-2",
        cityId: 2,
        type: 0,
        tileX: 2,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    state.buildings.set("enemy-house", {
        id: "enemy-house",
        ownerId: "enemy-1",
        cityId: 1,
        type: 300,
        tileX: 15,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 10
    });
    state.cityFinance.set(1, {
        cash: 1,
        income: 1,
        score: 0,
        researchLevel: 0,
        isOrbable: true
    });
    state.cityFinance.set(2, {
        cash: 1,
        income: 1,
        score: 0,
        researchLevel: 0,
        isOrbable: true
    });

    const nearest = resolveNearestOrbableCity(state);
    assert.ok(nearest);
    assert.equal(nearest.cityId, 1);
    assert.equal(nearest.direction, "East");
    assert.equal(nearest.distanceTiles, 5);
});

test("resolveNearestOrbableCity returns null when no enemy command center exists", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 480;
    state.local.y = 480;
    state.buildings.set("friendly-cc", {
        id: "friendly-cc",
        ownerId: "self",
        cityId: 0,
        type: 0,
        tileX: 9,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
    assert.equal(resolveNearestOrbableCity(state), null);
});

test("resolveNearestOrbableCity falls back to command center presence when finance hydration is missing", () => {
    const state = createClientState();
    state.local.city = 0;
    state.local.x = 480;
    state.local.y = 480;
    state.buildings.set("enemy-cc", {
        id: "enemy-cc",
        ownerId: "enemy",
        cityId: 17,
        type: 0,
        tileX: 14,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });

    const nearest = resolveNearestOrbableCity(state);
    assert.ok(nearest);
    assert.equal(nearest.cityId, 17);
});

test("formatNearestOrbableCityLine renders legacy-friendly top-left hint", () => {
    const line = formatNearestOrbableCityLine({
        cityId: 3,
        cityName: "Jumarity",
        direction: "North-West",
        distanceTiles: 12
    });
    assert.equal(line, "Nearest orbable city: Jumarity - North-West (~12 tiles)");
    assert.equal(formatNearestOrbableCityLine(null), "No orbable cities detected yet.");
});
