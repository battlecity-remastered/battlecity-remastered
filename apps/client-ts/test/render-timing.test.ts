import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    CLIENT_SIMULATION_STEP_MS,
    resolveLocalRenderPosition
} from "../src/app/render-timing.js";

const average = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
};

const standardDeviation = (values: number[]): number => {
    if (values.length === 0) {
        return 0;
    }
    const mean = average(values);
    const variance = values.reduce((sum, value) => {
        const delta = value - mean;
        return sum + (delta * delta);
    }, 0) / values.length;
    return Math.sqrt(variance);
};

test("resolveLocalRenderPosition extrapolates from the latest simulation step", () => {
    const state = createClientState();
    state.render.previousLocalX = 100;
    state.render.previousLocalY = 200;
    state.render.lastResolvedAt = null;
    state.local.x = 120;
    state.local.y = 205;
    state.debug.loop.lastUpdateAt = 1_000;

    const view = resolveLocalRenderPosition(state, 1_016);
    const expectedX = 120 + (20 * (16 / CLIENT_SIMULATION_STEP_MS));
    const expectedY = 205 + (5 * (16 / CLIENT_SIMULATION_STEP_MS));
    assert.ok(Math.abs(view.x - expectedX) < 0.001);
    assert.ok(Math.abs(view.y - expectedY) < 0.001);
});

test("resolveLocalRenderPosition clamps extrapolation to one simulation step", () => {
    const state = createClientState();
    state.render.previousLocalX = 0;
    state.render.previousLocalY = 0;
    state.render.lastResolvedAt = null;
    state.local.x = 20;
    state.local.y = 10;
    state.debug.loop.lastUpdateAt = 1_000;

    const view = resolveLocalRenderPosition(state, 1_500);
    assert.equal(view.x, 40);
    assert.equal(view.y, 20);
});

test("resolveLocalRenderPosition eases stop transitions instead of snapping projected offset", () => {
    const state = createClientState();
    state.render.previousLocalX = 100;
    state.render.previousLocalY = 100;
    state.local.x = 120;
    state.local.y = 100;
    state.debug.loop.lastUpdateAt = 1_000;

    const movingFrame = resolveLocalRenderPosition(state, 1_016);
    assert.ok(movingFrame.x > 120);

    state.render.previousLocalX = 120;
    state.render.previousLocalY = 100;
    state.local.x = 120;
    state.local.y = 100;
    state.debug.loop.lastUpdateAt = 1_033;

    const firstStopFrame = resolveLocalRenderPosition(state, 1_034);
    assert.ok(firstStopFrame.x > 120, `expected eased hold above local, got ${firstStopFrame.x}`);
    const secondStopFrame = resolveLocalRenderPosition(state, 1_050);
    assert.ok(secondStopFrame.x <= firstStopFrame.x);
});

test("extrapolated local sampling has lower frame-step jitter than tick-hold sampling", () => {
    const renderStepMs = 1000 / 60;
    const movementPerSimStep = 600 * (CLIENT_SIMULATION_STEP_MS / 1000);
    let simulationTimeMs = 0;
    let previousSimPos = 0;
    let currentSimPos = 0;
    let previousHold = 0;
    let previousSmooth = 0;
    const holdDeltas: number[] = [];
    const smoothDeltas: number[] = [];

    for (let t = renderStepMs; t <= 3_000; t += renderStepMs) {
        while ((t - simulationTimeMs) >= CLIENT_SIMULATION_STEP_MS) {
            previousSimPos = currentSimPos;
            currentSimPos += movementPerSimStep;
            simulationTimeMs += CLIENT_SIMULATION_STEP_MS;
        }
        const alpha = Math.max(0, Math.min(1, (t - simulationTimeMs) / CLIENT_SIMULATION_STEP_MS));
        const holdPos = currentSimPos;
        const smoothPos = currentSimPos + ((currentSimPos - previousSimPos) * alpha);

        if (t > 600) {
            holdDeltas.push(holdPos - previousHold);
            smoothDeltas.push(smoothPos - previousSmooth);
        }
        previousHold = holdPos;
        previousSmooth = smoothPos;
    }

    const holdStdDev = standardDeviation(holdDeltas);
    const smoothStdDev = standardDeviation(smoothDeltas);
    assert.ok(
        smoothStdDev < (holdStdDev * 0.25),
        `expected smooth jitter (${smoothStdDev.toFixed(3)}) << hold jitter (${holdStdDev.toFixed(3)})`
    );
});
