import test from "node:test";
import assert from "node:assert/strict";
import { tickDefenseTurrets } from "../src/domain/defense/DefenseTurretService.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import type { EventEnvelope } from "@battlecity/protocol";

const makeStateAndBroadcast = () => {
    const state = createRuntimeState();
    const broadcast: EventEnvelope[] = [];
    const emitter = createRuntimeEmitter(state, {
        emitAll: (event) => broadcast.push(event),
        emitTo: () => undefined,
        reject: () => undefined
    });
    return { state, broadcast, emitter };
};

test("defense turret uses classic 400ms fire cooldown", () => {
    const { state, broadcast, emitter } = makeStateAndBroadcast();
    const config = { ...DEFAULT_RUNTIME_CONFIG };

    state.defenses.set("def_1", {
        id: "def_1",
        cityId: 1,
        type: 9,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100,
        orientation: 0
    });
    state.players.set("enemy", {
        id: "enemy",
        city: 2,
        x: 480,
        y: 176,
        direction: 0,
        speed: 0,
        health: 100,
        maxHealth: 100
    });

    tickDefenseTurrets(state, config, emitter, 0);
    tickDefenseTurrets(state, config, emitter, 300);
    tickDefenseTurrets(state, config, emitter, 400);

    const defenseShots = broadcast.filter((event) => {
        if (event.type !== "bullet.fired") {
            return false;
        }
        const payload = event.payload as { ownerId?: string };
        return payload.ownerId === "def_1";
    });
    assert.equal(defenseShots.length, 2);
});

test("defense turret does not idle-spin without targets", () => {
    const { state, broadcast, emitter } = makeStateAndBroadcast();
    const config = { ...DEFAULT_RUNTIME_CONFIG };

    state.defenses.set("def_1", {
        id: "def_1",
        cityId: 1,
        type: 9,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100,
        orientation: 7
    });

    tickDefenseTurrets(state, config, emitter, 0);

    const defense = state.defenses.get("def_1");
    assert.equal(defense?.orientation, 7);
    const orientationEvents = broadcast.filter((event) => event.type === "defense.update");
    assert.equal(orientationEvents.length, 0);
});

test("defense turret snaps to target heading and can fire immediately", () => {
    const { state, broadcast, emitter } = makeStateAndBroadcast();
    const config = { ...DEFAULT_RUNTIME_CONFIG };

    state.defenses.set("def_1", {
        id: "def_1",
        cityId: 1,
        type: 9,
        tileX: 10,
        tileY: 10,
        health: 100,
        maxHealth: 100,
        orientation: 0
    });
    state.players.set("enemy", {
        id: "enemy",
        city: 2,
        x: 100,
        y: 480,
        direction: 0,
        speed: 0,
        health: 100,
        maxHealth: 100
    });

    tickDefenseTurrets(state, config, emitter, 0);

    const orientationEvents = broadcast.filter((event) => event.type === "defense.update");
    assert.ok(orientationEvents.length >= 1);
    const defenseShots = broadcast.filter((event) => {
        if (event.type !== "bullet.fired") {
            return false;
        }
        const payload = event.payload as { ownerId?: string };
        return payload.ownerId === "def_1";
    });
    assert.equal(defenseShots.length, 1);
});
