import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope } from "@battlecity/protocol";
import { MAX_PENDING_TANK_INPUT_MS } from "@battlecity/sim-core";
import { createClientState, updateFromSnapshot } from "../src/app/state.js";
import { advancePredictedMovement, takeUnsentMovementFrames } from "../src/app/movement-prediction.js";
import { GameRuntime } from "../../server-ts/src/runtime/GameRuntime.js";
import { createRuntimeState } from "../../server-ts/src/runtime/types.js";
import { buildPlayersSnapshot } from "../../server-ts/src/runtime/snapshot.js";

test("a prolonged outage bounds prediction and retries the missing input prefix", context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const client = createClientState();
    Object.assign(client.local, { id: "pilot", x: 480, y: 480, direction: 8 });
    client.controls.moveForward = true;
    const initial = createRuntimeState();
    initial.socketCities.set("pilot", 0);
    initial.players.set("pilot", { id: "pilot", city: 0, x: 480, y: 480, direction: 8, speed: 600, health: 100, maxHealth: 100, lastMovementInputSeq: 0, lastAcceptedUpdateAt: now });
    const server = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: () => assert.fail("recovered inputs must be accepted") }, {}, initial);
    for (let frame = 0; frame < 100; frame++) {
        now += 50;
        advancePredictedMovement(client, 50);
        // Simulate commands lost before reaching authority, not merely delayed.
        takeUnsentMovementFrames(client);
    }
    assert.ok(client.movement.pendingMs <= MAX_PENDING_TANK_INPUT_MS);
    assert.ok(Math.abs(client.local.x - (480 + 600 * MAX_PENDING_TANK_INPUT_MS / 1000)) < 1e-6);
    const predictedX = client.local.x;
    now += 1000;
    for (let seq = 1; client.movement.pending.length && seq < 10; seq++) {
        const inputFrames = takeUnsentMovementFrames(client);
        assert.ok(inputFrames.length);
        server.handleRawEvent("pilot", makeEnvelope("player.update", seq, { id: "pilot", city: 0, direction: 8, isMoving: true,
            offset: { x: client.local.x, y: client.local.y }, inputFrames }));
        updateFromSnapshot(client, buildPlayersSnapshot(server.getReadonlyState()));
    }
    assert.equal(client.movement.pending.length, 0);
    assert.equal(client.movement.serverClippedMs, 0);
    assert.equal(client.local.x, predictedX);
    assert.equal(client.movement.maxCorrectionPx, 0);
    advancePredictedMovement(client, 50);
    assert.ok(client.local.x > predictedX, "driving resumes as soon as the backlog is acknowledged");
});
