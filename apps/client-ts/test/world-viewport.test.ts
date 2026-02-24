import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    PANEL_WIDTH,
    resolvePointerWorldTile,
    resolveWorldViewport
} from "../src/gameplay/world-viewport.js";

test("resolveWorldViewport reserves right panel width", () => {
    const viewport = resolveWorldViewport(1280, 720);
    assert.equal(viewport.worldWidth, 1280 - PANEL_WIDTH);
    assert.equal(viewport.panelStartX, 1280 - PANEL_WIDTH);
    assert.equal(viewport.centerY, 360);
});

test("resolvePointerWorldTile maps pointer using camera-centered world viewport", () => {
    const state = createClientState();
    state.local.x = 480;
    state.local.y = 240;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 265;
    state.pointer.y = 220;

    const tile = resolvePointerWorldTile(state);
    assert.ok(tile);
    assert.equal(tile.tileX, 11);
    assert.equal(tile.tileY, 4);
});

test("resolvePointerWorldTile returns null when pointer is inside side panel", () => {
    const state = createClientState();
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 500;
    state.pointer.y = 220;

    assert.equal(resolvePointerWorldTile(state), null);
});
