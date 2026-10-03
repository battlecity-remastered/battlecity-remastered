import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createClientState } from "../src/app/state.js";
import { createOrbGroundShake } from "../src/render/three/orb-ground-shake.js";
import { createLiveWorld } from "../src/render/three/live-world.js";
import { applyServerEvent } from "../src/app/network-events.js";
import { makeEnvelope } from "@battlecity/protocol";

test("broadcast orbs shake near and distant players alike, settle, and preserve tank coordinates", () => {
    for (const x of [100, 20000]) {
        const state = createClientState(), camera = new THREE.OrthographicCamera(), shake = createOrbGroundShake();
        state.local.x = x; camera.position.set(5, 40, 8);
        shake(state, camera, 1000); assert.equal(camera.position.x, 5);
        state.events.lastOrbEvent = { sourceCityId: 1, targetCityId: 2, by: "other-player", awardedScore: 20, at: 1000 };
        shake(state, camera, 1100);
        assert.notEqual(camera.position.x, 5); assert.ok(Math.abs(camera.position.x - 5) < .2);
        assert.equal(state.local.x, x);
        camera.position.set(5, 40, 8); shake(state, camera, 2000);
        assert.deepEqual(camera.position.toArray(), [5, 40, 8]);
    }
});
test("reduced-motion preference suppresses the orb camera shake", () => {
    const state = createClientState(), camera = new THREE.OrthographicCamera();
    state.events.lastOrbEvent = { sourceCityId: 1, targetCityId: 2, by: "other", awardedScore: 10, at: 1000 };
    createOrbGroundShake(true)(state, camera, 1100);
    assert.deepEqual(camera.position.toArray(), [0, 0, 0]);
});
test("orbed defenses use the same destruction callback as bomb-destroyed defenses", () => {
    for (const reason of ["city_orbed", "destroyed"] as const) {
        const state = createClientState(), scene = new THREE.Scene(); let destroyed = 0;
        state.local.city = 0;
        state.defenses.set("tower", { id: "tower", cityId: 0, type: 9, tileX: 10, tileY: 10, health: 32, maxHealth: 32 });
        const world = createLiveWorld(scene, new THREE.Group(), new Map(), new THREE.Group(), () => new THREE.Group(), () => {}, () => {}, () => { destroyed++; return true; });
        world.update(state, 0);
        world.observe(makeEnvelope("defense.remove", 1, { id: "tower", reason }));
        state.defenses.clear(); world.update(state, .016);
        assert.equal(destroyed, 1, reason);
    }
});

test("orb blasts and purple collapse originate at the destroyed city, never a distant spectator's tank", () => {
    const state = createClientState(); state.local.x = 100; state.local.y = 200;
    state.buildings.set("cc", { id: "cc", ownerId: "enemy", cityId: 2, type: 0, tileX: 90, tileY: 80, health: 120, maxHealth: 120, population: 0 });
    applyServerEvent(state, makeEnvelope("city.orbed", 1, { sourceCityId: 1, targetCityId: 2, by: "other", awardedScore: 20 }));
    assert.deepEqual(state.events.lastOrbEvent!.position, { x: 4392, y: 3912 });
    assert.equal(state.events.effects.explosions.at(-1)!.x, 4392);
    assert.equal(state.events.effects.explosions.at(-1)!.y, 3912);
});
