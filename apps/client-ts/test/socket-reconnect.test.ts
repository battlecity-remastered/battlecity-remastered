import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildReconnectJoinPayload, clearClientWorldForReconnect } from "../src/network/socket.js";

test("clearClientWorldForReconnect drops stale world entities and resets local assignment", () => {
    const state = createClientState();
    state.local.id = "socket-old";
    state.local.city = 6;
    state.local.health = 42;
    state.local.maxHealth = 140;
    state.remotePlayers.set("r1", { id: "r1", city: 6, direction: 0, x: 100, y: 100 });
    state.cityFinance.set(6, { cash: 5, income: 2, score: 1, researchLevel: 0 });
    state.research.set(6, { completed: [1] });
    state.factoryStock.set(6, new Map([[0, 3]]));
    state.inventory.set(2, 7);
    state.hazards.set("h1", { id: "h1", cityId: 6, type: 2, x: 12, y: 13, radius: 2 });
    state.bullets.set("b1", { id: "b1", ownerId: "r1", city: 6, x: 12, y: 13, direction: 0, speed: 8, type: 0 });
    state.buildings.set("build_1", {
        id: "build_1",
        ownerId: "r1",
        cityId: 6,
        type: 100,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100,
        population: 0
    });
    state.defenses.set("d1", {
        id: "d1",
        cityId: 6,
        type: 9,
        tileX: 1,
        tileY: 1,
        health: 100,
        maxHealth: 100
    });
    state.events.effects.explosions.push({
        id: "fx1",
        x: 10,
        y: 10,
        createdAt: Date.now(),
        variant: "small"
    });
    state.events.effects.floatingPoints.push({
        id: "fp1",
        x: 10,
        y: 10,
        amount: 25,
        createdAt: Date.now()
    });
    state.ui.selectedInventoryItemType = 2;
    state.ui.bombArmed = true;
    state.ui.showBuildMenu = true;
    state.ui.buildGhostMode = true;
    state.ui.buildDemolishMode = true;
    state.ui.pendingBuildPlacement = { tileX: 1, tileY: 1, type: 300 };

    clearClientWorldForReconnect(state);

    assert.equal(state.local.id, null);
    assert.equal(state.local.city, 6);
    assert.equal(state.local.health, 100);
    assert.equal(state.local.maxHealth, 100);
    assert.equal(state.remotePlayers.size, 0);
    assert.equal(state.cityFinance.size, 0);
    assert.equal(state.research.size, 0);
    assert.equal(state.factoryStock.size, 0);
    assert.equal(state.inventory.size, 0);
    assert.equal(state.hazards.size, 0);
    assert.equal(state.bullets.size, 0);
    assert.equal(state.buildings.size, 0);
    assert.equal(state.defenses.size, 0);
    assert.equal(state.events.effects.explosions.length, 0);
    assert.equal(state.events.effects.floatingPoints.length, 0);
    assert.equal(state.ui.selectedInventoryItemType, null);
    assert.equal(state.ui.bombArmed, false);
    assert.equal(state.ui.showBuildMenu, false);
    assert.equal(state.ui.buildGhostMode, false);
    assert.equal(state.ui.buildDemolishMode, false);
    assert.equal(state.ui.pendingBuildPlacement, null);
});

test("buildReconnectJoinPayload carries prior city and identity", () => {
    const state = createClientState();
    state.identity.callsign = "Falcon";
    state.identity.userId = "user-123";

    const payload = buildReconnectJoinPayload(state, 4);
    assert.deepEqual(payload, {
        desiredCity: 4,
        callsign: "Falcon",
        userId: "user-123"
    });
});

test("buildReconnectJoinPayload omits empty user id", () => {
    const state = createClientState();
    state.identity.callsign = "Nomad";
    state.identity.userId = "";

    const payload = buildReconnectJoinPayload(state, 1);
    assert.deepEqual(payload, {
        desiredCity: 1,
        callsign: "Nomad"
    });
});
