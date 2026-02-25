import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    buildDebugHudLines,
    recordDebugLatencySample,
    recordDebugOutboundSend,
    recordDebugRenderTick,
    recordDebugRejection,
    recordDebugServerEvent,
    recordDebugSocketState,
    recordDebugUpdateTick,
    toggleDebugMode
} from "../src/app/debug-metrics.js";

test("toggleDebugMode flips the debug state", () => {
    const state = createClientState();
    assert.equal(state.ui.showBotDebug, false);
    toggleDebugMode(state);
    assert.equal(state.ui.showBotDebug, true);
    toggleDebugMode(state);
    assert.equal(state.ui.showBotDebug, false);
});

test("debug metrics capture loop/send/rejection state for HUD output", () => {
    const state = createClientState();
    recordDebugSocketState(state, true);
    recordDebugUpdateTick(state, 1000);
    recordDebugUpdateTick(state, 1033);
    recordDebugRenderTick(state, 1040);
    recordDebugRenderTick(state, 1060);
    recordDebugOutboundSend(state, 1100);
    recordDebugOutboundSend(state, 1200);
    recordDebugServerEvent(state, 1210);
    recordDebugRejection(state, "build_denied", 1215);

    const lines = buildDebugHudLines(state, 1230);
    assert.ok(lines.some((line) => line.startsWith("Ping: n/a")));
    assert.ok(lines.some((line) => line.includes("Client sends: 10.0 Hz")));
    assert.ok(lines.some((line) => line.includes("Rejections: 1 last=build_denied")));
    assert.ok(lines.some((line) => line.includes("Render/update: 2/2")));
    assert.ok(lines.some((line) => line.includes("Socket: connected")));
    assert.ok(lines.some((line) => line.includes("Last server event: 20 ms ago")));
});

test("latency samples compute aggregate fields", () => {
    const state = createClientState();
    recordDebugLatencySample(state, 30, 2000);
    recordDebugLatencySample(state, 50, 2100);
    recordDebugLatencySample(state, 40, 2200);

    assert.equal(state.debug.latency.latest, 40);
    assert.equal(Math.round(state.debug.latency.avg ?? 0), 40);
    assert.equal(state.debug.latency.min, 30);
    assert.equal(state.debug.latency.max, 50);
    assert.equal(Math.round(state.debug.latency.jitter ?? 0), 7);

    const lines = buildDebugHudLines(state, 2250);
    assert.ok(lines.some((line) => line.includes("Ping: 40 ms")));
    assert.ok(lines.some((line) => line.includes("n=3")));
});

test("render mismatch counter tracks stale update starvation, not normal render cadence", () => {
    const state = createClientState();

    recordDebugUpdateTick(state, 1_000);
    recordDebugRenderTick(state, 1_016);
    recordDebugRenderTick(state, 1_033);
    assert.equal(state.debug.loop.mismatchEvents, 0);

    recordDebugRenderTick(state, 1_080);
    assert.equal(state.debug.loop.mismatchEvents, 1);

    const lines = buildDebugHudLines(state, 1_080);
    assert.ok(lines.some((line) => line.includes("stale updates 1")));
});
