import test from "node:test";
import assert from "node:assert/strict";
import { tankHullRatio } from "../src/render/three/tank-hull-meter.js";
import { isTankLabelVisible } from "../src/render/three/pilot-presentation.js";
import type { RemotePlayer } from "../src/app/state-types.js";

const enemy: RemotePlayer = { id: "enemy", city: 1, x: 100, y: 100, direction: 0, health: 150, maxHealth: 200 };
test("hull telemetry uses authoritative maximums and clamps overhealing and damage", () => {
    assert.equal(tankHullRatio(enemy), .75);
    assert.equal(tankHullRatio({ ...enemy, health: 500 }), 1);
    assert.equal(tankHullRatio({ ...enemy, health: -10 }), 0);
    assert.equal(tankHullRatio({ ...enemy, health: 40, maxHealth: undefined }), .4);
});
test("missing or invalid health is unknown rather than a fictitious full-health target", () => {
    for (const health of [undefined, NaN, Infinity]) assert.equal(tankHullRatio({ ...enemy, health }), null);
    for (const maxHealth of [0, -1, NaN, Infinity]) assert.equal(tankHullRatio({ ...enemy, maxHealth }), null);
});
test("enemy hull/name telemetry follows death and cloak visibility", () => {
    assert.equal(isTankLabelVisible({ ...enemy, cloakedUntil: 2000 }, 0, 1000), false);
    assert.equal(isTankLabelVisible({ ...enemy, cloakedUntil: 2000 }, 0, 2000), true);
    assert.equal(isTankLabelVisible({ ...enemy, health: 0 }, 0, 1000), false);
});
