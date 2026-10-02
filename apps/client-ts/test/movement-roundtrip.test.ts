import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope, type KnownEventPayloadByType } from "@battlecity/protocol";
import { createClientState, updateFromSnapshot } from "../src/app/state.js";
import { advancePredictedMovement, takeUnsentMovementFrames, resetMovementPrediction } from "../src/app/movement-prediction.js";
import { GameRuntime } from "../../server-ts/src/runtime/GameRuntime.js";
import { createRuntimeState } from "../../server-ts/src/runtime/types.js";
import { buildPlayersSnapshot } from "../../server-ts/src/runtime/snapshot.js";

type Snapshot = KnownEventPayloadByType["players.snapshot"];
type Packet = { at: number; frames: NonNullable<KnownEventPayloadByType["player.update"]["inputFrames"]> };

for (const stall of [450, 1400]) for (const fps of [6, 10, 30, 60, 144]) test(`prediction stays aligned at ${fps} FPS with ${stall}ms packet stalls, turning, reverse and collisions`, context => {
    let now = 10_000;
    context.mock.method(Date, "now", () => now);
    const client = createClientState();
    Object.assign(client.local, { id: "pilot", x: 480, y: 480, direction: 8 });
    const terrain = new Set<string>();
    for (let y = 7; y < 22; y++) terrain.add(`16,${y}`);
    client.world.blockingTiles = terrain;
    const initial = createRuntimeState({ blockingTiles: terrain });
    initial.socketCities.set("pilot", 0);
    initial.players.set("pilot", { id: "pilot", city: 0, x: 480, y: 480, direction: 8, speed: 600, health: 100, maxHealth: 100, lastMovementInputSeq: 0, lastAcceptedUpdateAt: now });
    const rejected: string[] = [];
    const server = new GameRuntime({ emitAll: () => {}, emitTo: () => {}, reject: (_id, reason) => rejected.push(reason) }, {}, initial);
    const packets: Packet[] = [], snapshots: Array<{ at: number; snapshot: Snapshot }> = [];
    let frameAt = 0, sendAt = 0, snapshotAt = 0, eventSeq = 0, maxCorrection = 0, movementFrames = 0;
    let lastPacketAt = 0, lastSnapshotAt = 0;
    for (let time = 0; time <= 7000; time += 5) {
        now = 10_000 + time;
        if (time >= frameAt && time < 5000) {
            const before = client.movement.pending.length;
            client.controls.moveForward = time < 2800;
            client.controls.moveBackward = time >= 3200 && time < 4800;
            client.controls.turnRight = time > 700 && time < 2400;
            client.controls.turnLeft = time >= 3200 && time < 4300;
            advancePredictedMovement(client, Math.min(100, 1000 / fps));
            movementFrames += client.movement.pending.length - before;
            frameAt += 1000 / fps;
        }
        if (time >= sendAt && time < 5500) {
            // Ordered TCP burst: periodic stalls then a fast queue drain.
            lastPacketAt = Math.max(lastPacketAt + 1, time + 120 + (time % 3000 < 250 ? stall : 0));
            packets.push({ at: lastPacketAt, frames: takeUnsentMovementFrames(client) });
            sendAt += 50;
        }
        while (packets[0] && packets[0].at <= time) {
            const packet = packets.shift()!;
            server.handleRawEvent("pilot", makeEnvelope("player.update", ++eventSeq, {
                id: "pilot", city: 0, direction: client.local.direction, isMoving: true, throttle: 1,
                offset: { x: client.local.x, y: client.local.y }, inputFrames: packet.frames
            }));
        }
        if (time >= snapshotAt) {
            const snapshot = buildPlayersSnapshot(server.getReadonlyState());
            // Different client/server clocks must not affect ack-based correction.
            snapshot.serverTime += 3_600_000;
            lastSnapshotAt = Math.max(lastSnapshotAt + 1, time + 100 + (time % 1300 < 200 ? 250 : 0));
            snapshots.push({ at: lastSnapshotAt, snapshot });
            snapshotAt += 50;
        }
        while (snapshots[0] && snapshots[0].at <= time) {
            const snapshot = snapshots.shift()!.snapshot;
            const x = client.local.x, y = client.local.y;
            updateFromSnapshot(client, snapshot);
            maxCorrection = Math.max(maxCorrection, Math.hypot(client.local.x - x, client.local.y - y));
        }
    }
    const authoritative = server.getReadonlyState().players.get("pilot")!;
    assert.deepEqual(rejected, []);
    assert.equal(authoritative.movementClippedMs, 0, "legitimate buffered movement must not be clipped");
    assert.ok(maxCorrection < 1e-6, `prediction was pulled ${maxCorrection}px by delayed snapshots`);
    assert.ok(Math.hypot(client.local.x - authoritative.x, client.local.y - authoritative.y) < 1e-6);
    assert.equal(authoritative.lastMovementInputSeq, movementFrames);
    assert.equal(client.movement.pending.length, 0);
    assert.ok(authoritative.x !== 480 || authoritative.y !== 480);
});

test("older acknowledgements cannot rewind the tank and a new assignment resets inputs", () => {
    const state = createClientState();
    Object.assign(state.local, { id: "pilot", x: 480, y: 480, direction: 8 });
    state.controls.moveForward = true;
    advancePredictedMovement(state, 50);
    takeUnsentMovementFrames(state);
    const snapshot: Snapshot = { serverTime: Date.now(), players: [{ id: "pilot", city: 0,
        offset: { x: state.local.x, y: state.local.y }, direction: 8, movementAck: { seq: 1, direction: 8 } }] };
    updateFromSnapshot(state, snapshot);
    const x = state.local.x;
    assert.equal(state.movement.pending.length, 0);
    updateFromSnapshot(state, { ...snapshot, players: [{ ...snapshot.players[0]!, offset: { x: 9000, y: 9000 }, movementAck: { seq: 0, direction: 0 } }] });
    assert.equal(state.local.x, x);
    resetMovementPrediction(state);
    assert.equal(state.movement.nextSeq, 1);
    assert.equal(state.movement.lastAck, 0);
    assert.equal(state.movement.lastSentSeq, 0);
});
