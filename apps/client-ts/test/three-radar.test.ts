import test from "node:test";
import assert from "node:assert/strict";
import { projectRadarPoint, resolveRadarNavigation } from "../src/render/three/radar-model.js";
import { resolveCitySpawn } from "../src/world/city-spawn.js";

test("radar uses tank sprite center and original command center footprint", () => {
    const spawn = resolveCitySpawn(0)!;
    const nav = resolveRadarNavigation(spawn.x, spawn.y, 8, 0);
    assert.deepEqual(nav.home, { x: 32.5, y: 32 });
    assert.equal(nav.homeName, "Balkh");
    assert.equal(nav.player.x, (spawn.x + 24) / 48);
    assert.equal(nav.player.y, (spawn.y + 24) / 48);
    assert.equal(nav.heading, 90);
    assert.ok(nav.distance < 3);
});

test("home bearing and tile distance stay correct in all cardinal directions", () => {
    for (const [dx, dy, compass, bearing] of [[0, 10, "N", 0], [-10, 0, "E", 90], [0, -10, "S", 180], [10, 0, "W", 270]] as const) {
        const nav = resolveRadarNavigation((32.5 + dx) * 48 - 24, (32 + dy) * 48 - 24, 0, 0);
        assert.equal(nav.compass, compass);
        assert.equal(nav.bearing, bearing);
        assert.equal(nav.distance, 10);
    }
});

test("distant home pins to the radar rim while preserving its bearing", () => {
    const center = { x: 200, y: 200 }, point = { x: 32.5, y: 32 };
    const marker = projectRadarPoint(point, center);
    assert.ok(marker.outside);
    assert.ok(Math.abs(Math.hypot(marker.x - 50, marker.y - 50) - 42) < 1e-8);
    assert.ok(Math.abs((marker.x - 50) / (marker.y - 50) - (point.x - center.x) / (point.y - center.y)) < 1e-8);
    assert.deepEqual(projectRadarPoint(center, center), { x: 50, y: 50, outside: false });
});

test("home follows the player's city and heading wraps across a full rotation", () => {
    const nav = resolveRadarNavigation(200, 200, -1, 9);
    assert.deepEqual(nav.home, { x: 96.5, y: 96 });
    assert.equal(nav.homeName, "Algiers");
    assert.equal(nav.heading, 348.75);
    assert.equal(resolveRadarNavigation(0, 0, 33, -1).homeName, "Balkh");
});
