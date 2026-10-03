import * as THREE from "three";
import { writeFile } from "node:fs/promises";
import { createClientState } from "../../../apps/client-ts/src/app/state.ts";
import { createLiveWorld } from "../../../apps/client-ts/src/render/three/live-world.ts";

const summaries = [];
for (const fps of [24, 60, 120]) {
    const state = createClientState(), scene = new THREE.Scene(), template = new THREE.Group();
    const world = createLiveWorld(scene, template, new Map(), template, () => template, () => {}, () => {});
    const target = { id: "moving-defender", city: 17, x: 1000, y: 1000, direction: 8, health: 20, maxHealth: 20, botRole: "shooter" };
    state.remotePlayers.set(target.id, target);
    const offsets = [];
    for (let frame = 0; frame < fps * 5; frame++) {
        const seconds = frame / fps;
        target.x = 1000 + Math.floor(seconds * 20) / 20 * 220;
        world.update(state, 1 / fps);
        const model = world.playerModels.get(target.id);
        if (seconds > 1) offsets.push(target.x + 24 - (model.position.x + 256) * 48);
    }
    summaries.push({ fps, snapshotHz: 20, speedPixelsPerSecond: 220, latestReceivedPositionLagPixels: { mean: offsets.reduce((a, b) => a + b, 0) / offsets.length, min: Math.min(...offsets), max: Math.max(...offsets) } });
}
await writeFile(new URL("aiming-diagnostic.json", import.meta.url), JSON.stringify({ note: "Deterministic presentation-only diagnostic, not a measured network latency or proof of the reported miss. No renderer or gameplay changes.", summaries }, null, 2));
console.log(JSON.stringify(summaries, null, 2));
