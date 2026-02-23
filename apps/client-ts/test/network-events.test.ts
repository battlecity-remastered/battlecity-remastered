import test from "node:test";
import assert from "node:assert/strict";
import { makeKnownEnvelope } from "@battlecity/protocol";
import { applyServerEvent } from "../src/app/network-events.js";
import { createClientState } from "../src/app/state.js";

test("lobby lifecycle events update lobby state", () => {
    const state = createClientState();

    applyServerEvent(state, makeKnownEnvelope("lobby.assignment", 1, {
        id: "p1",
        city: 2,
        role: "mayor"
    }));
    applyServerEvent(state, makeKnownEnvelope("lobby.denied", 2, {
        reason: "lobby_full"
    }));
    applyServerEvent(state, makeKnownEnvelope("lobby.snapshot", 3, [
        {
            city: 2,
            mayorId: "p1",
            recruitCount: 1
        }
    ]));
    applyServerEvent(state, makeKnownEnvelope("lobby.released", 4, {
        id: "p2",
        city: 2
    }));

    assert.equal(state.local.id, "p1");
    assert.equal(state.local.city, 2);
    assert.equal(state.lobby.deniedReason, "lobby_full");
    assert.equal(state.lobby.assignments.length, 1);
    assert.equal(state.lobby.assignments[0]?.mayorId, "p1");
    assert.equal(state.lobby.lastReleasedPlayerId, "p2");
});

test("economy/research/factory/chat/orb events update client stores", () => {
    const state = createClientState();

    applyServerEvent(state, makeKnownEnvelope("city.finance", 1, {
        cityId: 2,
        cash: 300,
        income: 25,
        score: 120,
        researchLevel: 1
    }));
    applyServerEvent(state, makeKnownEnvelope("research.update", 2, {
        cityId: 2,
        active: {
            researchType: 3,
            remainingMs: 1200
        },
        completed: [1, 2]
    }));
    applyServerEvent(state, makeKnownEnvelope("factory.stock", 3, {
        cityId: 2,
        itemType: 0,
        stock: 4
    }));
    applyServerEvent(state, makeKnownEnvelope("inventory.update", 4, {
        playerId: "p-local",
        items: [{ itemType: 0, count: 2 }]
    }));
    applyServerEvent(state, makeKnownEnvelope("hazard.spawn", 4, {
        id: "hazard_1",
        cityId: 2,
        type: 2,
        position: { x: 128, y: 256 },
        radius: 72
    }));
    applyServerEvent(state, makeKnownEnvelope("hazard.remove", 5, {
        id: "hazard_1",
        reason: "detonated"
    }));
    applyServerEvent(state, makeKnownEnvelope("chat.history", 6, [{
        id: "c1",
        from: "p1",
        city: 2,
        text: "hello",
        ts: Date.now(),
        scope: "team"
    }]));
    applyServerEvent(state, makeKnownEnvelope("chat.message", 7, {
        id: "c2",
        from: "p2",
        city: 2,
        text: "world",
        ts: Date.now(),
        scope: "global"
    }));
    applyServerEvent(state, makeKnownEnvelope("chat.rate_limit", 8, {
        scope: "team",
        retryAt: 99999
    }));
    applyServerEvent(state, makeKnownEnvelope("city.orbed", 9, {
        sourceCityId: 1,
        targetCityId: 2,
        by: "p1",
        awardedScore: 250
    }));
    applyServerEvent(state, makeKnownEnvelope("score.promotion", 10, {
        cityId: 1,
        score: 1250,
        rank: "captain"
    }));
    applyServerEvent(state, makeKnownEnvelope("build.denied", 11, {
        reason: "research_required",
        cityId: 2,
        type: 107,
        tileX: 10,
        tileY: 10
    }));
    applyServerEvent(state, makeKnownEnvelope("demolish.denied", 12, {
        id: "building_1",
        reason: "not_mayor"
    }));

    assert.equal(state.cityFinance.get(2)?.cash, 300);
    assert.equal(state.research.get(2)?.completed.length, 2);
    assert.equal(state.factoryStock.get(2)?.get(0), 4);
    assert.equal(state.inventory.get(0), undefined);
    assert.equal(state.hazards.size, 0);
    assert.equal(state.chat.history.length, 2);
    assert.equal(state.chat.rateLimitedUntil, 99999);
    assert.equal(state.events.lastOrbedCityId, 2);
    assert.equal(state.events.promotions[0]?.rank, "captain");
    assert.equal(state.events.lastBuildDeniedReason, "research_required");
    assert.equal(state.events.lastDemolishDeniedReason, "not_mayor");
});

test("inventory.update applies only to local player", () => {
    const state = createClientState();
    state.local.id = "p1";

    applyServerEvent(state, makeKnownEnvelope("inventory.update", 1, {
        playerId: "p1",
        items: [{ itemType: 0, count: 3 }]
    }));
    applyServerEvent(state, makeKnownEnvelope("inventory.update", 2, {
        playerId: "p2",
        items: [{ itemType: 0, count: 1 }]
    }));

    assert.equal(state.inventory.get(0), 3);
});
