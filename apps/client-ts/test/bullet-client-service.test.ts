import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    resolveBulletSpeed,
    stepClientBullets
} from "../src/gameplay/bullets/BulletClientService.js";

test("resolveBulletSpeed matches supported projectile classes", () => {
    assert.equal(resolveBulletSpeed(0), 720);
    assert.equal(resolveBulletSpeed(1), 720);
    assert.equal(resolveBulletSpeed(3), 560);
});

test("stepClientBullets advances active bullets by heading and speed", () => {
    const state = createClientState();
    state.bullets.set("bullet_1", {
        id: "bullet_1",
        ownerId: "p1",
        city: 1,
        x: 100,
        y: 120,
        direction: 0,
        speed: 720,
        type: 0
    });

    stepClientBullets(state, 100);

    const bullet = state.bullets.get("bullet_1");
    assert.ok(bullet);
    assert.equal(Math.round(bullet.x), 172);
    assert.equal(Math.round(bullet.y), 120);
});
