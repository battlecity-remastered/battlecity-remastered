import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createResearchStatus, demoResearchStatus } from "../src/render/three/research-status.js";

const lab = (cityId = 1, type = 401, population = 50) => ({ id: `lab-${cityId}-${type}`, cityId, type, population, tileX: 30, tileY: 24, ownerId: "mayor", health: 120, maxHealth: 120 });

test("research panel counts down across offscreen frames but waits for authoritative completion", () => {
    const state = createClientState(), status = createResearchStatus(), building = lab();
    state.research.set(1, { active: { researchType: 401, remainingMs: 14000 }, completed: [] });
    status.sync(state, 1000);
    assert.equal(status.resolve(state, building, 1000).progress, 0);
    status.sync(state, 8000);
    assert.deepEqual(status.resolve(state, building, 8000), { phase: "researching", progress: .5, remainingMs: 7000, label: "RESEARCHING" });
    assert.deepEqual(status.resolve(state, building, 18000), { phase: "researching", progress: 1, remainingMs: 0, label: "FINALISING" });
    state.research.set(1, { completed: [401] });status.sync(state, 18000);
    assert.equal(status.resolve(state, building, 18000).phase, "ready");
});

test("research status follows the correct city/type, workers and replacement snapshots", () => {
    const state = createClientState(), status = createResearchStatus();
    state.research.set(1, { active: { researchType: 401, remainingMs: 10000 }, completed: [404] });status.sync(state, 0);
    assert.equal(status.resolve(state, lab(2), 5000).phase, "queued");
    assert.equal(status.resolve(state, lab(1, 405, 0), 5000).label, "AWAITING CREW");
    assert.equal(status.resolve(state, lab(1, 404, 0), 5000).phase, "ready");
    state.research.set(1, { active: { researchType: 401, remainingMs: 5000 }, completed: [404] });status.sync(state, 5000);
    assert.equal(status.resolve(state, lab(), 5000).progress, .5);
    state.research.set(1, { active: { researchType: 405, remainingMs: 10000 }, completed: [401, 404] });status.sync(state, 11000);
    assert.equal(status.resolve(state, lab(1, 405), 11000).progress, 0);
    state.research.clear();status.sync(state, 12000);
    assert.equal(status.resolve(state, lab(1, 405), 12000).phase, "queued");
});

test("offline research showcase demonstrates progress and completion on a bounded cycle", () => {
    assert.equal(demoResearchStatus(7).progress, .5);
    assert.equal(demoResearchStatus(14).phase, "ready");
    assert.equal(demoResearchStatus(23).phase, "ready");
    assert.equal(demoResearchStatus(24).phase, "researching");
});
