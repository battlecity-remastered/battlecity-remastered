import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDeterministicParityFixture } from "./fixtures/parity/deterministic-render-fixture.js";

const fixtureDir = resolve(process.cwd(), "apps/client-ts/test/fixtures/parity");

const readJson = <T>(name: string): T => {
    const path = resolve(fixtureDir, name);
    return JSON.parse(readFileSync(path, "utf8")) as T;
};

test("deterministic parity fixture has fixed viewport and entity inventory", () => {
    const fixture = createDeterministicParityFixture();

    assert.equal(fixture.viewport.surfaceWidth, 1024);
    assert.equal(fixture.viewport.surfaceHeight, 768);
    assert.equal(fixture.viewport.worldWidth, 824);
    assert.equal(fixture.viewport.panelStartX, 824);

    assert.equal(fixture.state.local.x, 6000);
    assert.equal(fixture.state.local.y, 6100);
    assert.equal(fixture.state.buildings.size, 5);
    assert.equal(fixture.state.defenses.size, 1);
    assert.equal(fixture.state.hazards.size, 3);
    assert.equal(fixture.state.remotePlayers.size, 2);
});

test("phase 0 baseline panel and radar snapshots are stable", () => {
    const panel = readJson<{
        panel: {
            top: { x: number; y: number };
            bottom: { x: number; y: number };
        };
    }>("baseline-panel.json");
    const radar = readJson<{
        range: number;
        bounds: {
            absoluteAt1024x768: { left: number; right: number; top: number; bottom: number };
        };
    }>("baseline-radar.json");

    assert.deepEqual(panel.panel.top, { x: 824, y: 0 });
    assert.deepEqual(panel.panel.bottom, { x: 824, y: 430 });
    assert.equal(radar.range, 2400);
    assert.deepEqual(radar.bounds.absoluteAt1024x768, {
        left: 852,
        right: 990,
        top: 8,
        bottom: 146
    });
});

test("phase 0 baseline building and item snapshots pin parity contracts", () => {
    const buildings = readJson<{
        baseFrame: { width: number; height: number };
        overlays: {
            research: { offsetX: number; offsetY: number };
            factory: { offsetX: number; offsetY: number };
        };
    }>("baseline-buildings.json");
    const items = readJson<{
        itemIds: Record<string, number>;
        bullets: { animationModulo: number };
    }>("baseline-items.json");

    assert.equal(buildings.baseFrame.width, 144);
    assert.equal(buildings.baseFrame.height, 144);
    assert.deepEqual(buildings.overlays.research, { offsetX: 14, offsetY: 98 });
    assert.deepEqual(buildings.overlays.factory, { offsetX: 56, offsetY: 52 });

    assert.equal(items.itemIds.bomb, 3);
    assert.equal(items.itemIds.mine, 4);
    assert.equal(items.itemIds.orb, 5);
    assert.equal(items.bullets.animationModulo, 4);
});
