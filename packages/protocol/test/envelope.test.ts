import test from "node:test";
import assert from "node:assert/strict";
import {
    canonicalizeEventType,
    decodeKnownEnvelope,
    decodeTypedEnvelope,
    makeKnownEnvelope,
    makeTypedEnvelope
} from "../src/index.js";

test("decodeTypedEnvelope validates known payload shapes", () => {
    const envelope = makeTypedEnvelope("player.update", 1, {
        id: "p1",
        city: 3,
        direction: 8,
        isMoving: true,
        offset: { x: 100, y: 200 }
    });

    const decoded = decodeTypedEnvelope(envelope);
    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "player.update");
        assert.equal((decoded.right.payload as { id: string }).id, "p1");
    }
});

test("decodeTypedEnvelope rejects malformed known payloads", () => {
    const decoded = decodeTypedEnvelope({
        type: "player.update",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: { id: "p1", city: "wrong" }
    });

    assert.equal(decoded._tag, "Left");
});

test("decodeKnownEnvelope accepts known schema events", () => {
    const envelope = makeKnownEnvelope("player.dead", 3, {
        id: "p2",
        by: "p1"
    });

    const decoded = decodeKnownEnvelope(envelope);
    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "player.dead");
        assert.equal(decoded.right.payload.id, "p2");
    }
});

test("decodeKnownEnvelope rejects unknown event types", () => {
    const decoded = decodeKnownEnvelope({
        type: "player",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: { id: "p1" }
    });

    assert.equal(decoded._tag, "Left");
});

test("decodeKnownEnvelope normalizes legacy alias type names", () => {
    const decoded = decodeKnownEnvelope({
        type: "player:health",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            id: "p1",
            health: 90,
            maxHealth: 100
        }
    });

    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "player.health");
    }
});

test("canonicalizeEventType maps known legacy aliases to canonical names", () => {
    assert.equal(canonicalizeEventType("players:snapshot"), "players.snapshot");
    assert.equal(canonicalizeEventType("bullet:fired"), "bullet.fired");
    assert.equal(canonicalizeEventType("bullet:resolved"), "bullet.resolved");
    assert.equal(canonicalizeEventType("city:finance"), "city.finance");
    assert.equal(canonicalizeEventType("score:profile"), "score.profile");
    assert.equal(canonicalizeEventType("new_building"), "building.placed");
    assert.equal(canonicalizeEventType("demolish_building"), "building.demolished");
    assert.equal(canonicalizeEventType("defense:deploy"), "defense.deploy.request");
    assert.equal(canonicalizeEventType("defense:update"), "defense.update");
    assert.equal(canonicalizeEventType("inventory:update"), "inventory.update");
    assert.equal(canonicalizeEventType("population:update"), "population.update");
    assert.equal(canonicalizeEventType("player:bot_damage"), "player.bot_damage");
    assert.equal(canonicalizeEventType("event:rejected"), "event.rejected");
    assert.equal(canonicalizeEventType("player.update"), "player.update");
});

test("decodeKnownEnvelope validates research.start.request payload", () => {
    const decoded = decodeKnownEnvelope({
        type: "research.start.request",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            cityId: 1,
            researchType: 2
        }
    });

    assert.equal(decoded._tag, "Right");
});

test("decodeKnownEnvelope validates defense.deploy.request payload", () => {
    const decoded = decodeKnownEnvelope({
        type: "defense.deploy.request",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            cityId: 2,
            type: 8,
            tileX: 10,
            tileY: 10
        }
    });

    assert.equal(decoded._tag, "Right");
});

test("decodeKnownEnvelope normalizes defense legacy aliases", () => {
    const deploy = decodeKnownEnvelope({
        type: "defense:deploy",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            cityId: 2,
            type: 8,
            tileX: 10,
            tileY: 10
        }
    });
    assert.equal(deploy._tag, "Right");
    if (deploy._tag === "Right") {
        assert.equal(deploy.right.type, "defense.deploy.request");
    }

    const update = decodeKnownEnvelope({
        type: "defense:update",
        version: "1",
        seq: 2,
        ts: Date.now(),
        payload: {
            id: "d1",
            health: 25,
            maxHealth: 40
        }
    });
    assert.equal(update._tag, "Right");
    if (update._tag === "Right") {
        assert.equal(update.right.type, "defense.update");
    }
});

test("decodeKnownEnvelope supports extended removal/reason payloads", () => {
    const hazard = decodeKnownEnvelope({
        type: "hazard.remove",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            id: "h1",
            reason: "city_orbed"
        }
    });
    assert.equal(hazard._tag, "Right");

    const bullet = decodeKnownEnvelope({
        type: "bullet.resolved",
        version: "1",
        seq: 2,
        ts: Date.now(),
        payload: {
            id: "b1",
            reason: "hit_terrain"
        }
    });
    assert.equal(bullet._tag, "Right");
});

test("decodeKnownEnvelope validates population updates and legacy alias", () => {
    const canonical = decodeKnownEnvelope({
        type: "population.update",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            id: "building_1",
            cityId: 2,
            type: 109,
            tileX: 10,
            tileY: 12,
            population: 20,
            attachedHouseId: "house_1",
            removed: false
        }
    });
    assert.equal(canonical._tag, "Right");

    const legacy = decodeKnownEnvelope({
        type: "population:update",
        version: "1",
        seq: 2,
        ts: Date.now(),
        payload: {
            id: "building_1",
            cityId: 2,
            type: 109,
            tileX: 10,
            tileY: 12,
            population: 0,
            removed: true
        }
    });
    assert.equal(legacy._tag, "Right");
    if (legacy._tag === "Right") {
        assert.equal(legacy.right.type, "population.update");
    }
});

test("decodeKnownEnvelope validates player bot-damage alias payload", () => {
    const decoded = decodeKnownEnvelope({
        type: "player:bot_damage",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            amount: 20,
            sourceType: "defender_bot",
            shooterId: "defender_17_1",
            bulletType: 0
        }
    });

    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "player.bot_damage");
    }
});

test("decodeKnownEnvelope validates event rejection alias payload", () => {
    const decoded = decodeKnownEnvelope({
        type: "event:rejected",
        version: "1",
        seq: 1,
        ts: Date.now(),
        payload: {
            reason: "ValidationFailed"
        }
    });

    assert.equal(decoded._tag, "Right");
    if (decoded._tag === "Right") {
        assert.equal(decoded.right.type, "event.rejected");
    }
});
