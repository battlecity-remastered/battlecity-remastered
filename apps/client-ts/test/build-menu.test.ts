import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createClientState } from "../src/app/state.js";
import {
    applyBuildMenuHotkey,
    buildBuildMenuLines,
    resolveBuildMenuEntries
} from "../src/ui/build-menu/BuildMenu.js";
import { isGhostTileBlocked } from "../src/ui/build-menu/GhostPlacement.js";
import { applyServerEvent } from "../src/app/network-events.js";
import { makeEnvelope } from "@battlecity/protocol";

const buildMenuPath = new URL("../src/ui/build-menu/BuildMenu.ts", import.meta.url);

test("a placed building immediately disables duplicate construction before the finance snapshot catches up", () => {
    const state = createClientState(); state.local.city = 3; state.ui.selectedBuildType = 112;
    state.cityFinance.set(3, { cash: 1000, income: 0, score: 0, researchLevel: 1, canBuildStates: new Map([[112, 1], [300, 1]]) });
    const placed = { id: "laser", ownerId: "mayor", cityId: 3, type: 112, tileX: 20, tileY: 20, health: 100, maxHealth: 100 };
    applyServerEvent(state, makeEnvelope("building.placed", 1, { ...placed, id: "other-laser", cityId: 4 }));
    assert.ok(resolveBuildMenuEntries(state).some(entry => entry.type === 112));
    applyServerEvent(state, makeEnvelope("building.placed", 2, placed));
    assert.equal(resolveBuildMenuEntries(state).some(entry => entry.type === 112), false);
    assert.equal(isGhostTileBlocked(state, 30, 30), true, "stale placement selection is blocked too");
    assert.equal(isGhostTileBlocked(state, 30, 30, 300), false, "housing remains repeatable");
    applyServerEvent(state, makeEnvelope("building.demolished", 3, { id: "laser", cityId: 3 }));
    assert.ok(resolveBuildMenuEntries(state).some(entry => entry.type === 112));
    assert.equal(isGhostTileBlocked(state, 30, 30), false);
});

test("applyBuildMenuHotkey toggles visibility and updates selected build type", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 3;
    state.lobby.assignments = [{ city: 3, mayorId: "p1", recruitCount: 0 }];
    assert.equal(state.ui.showBuildMenu, false);
    assert.equal(state.ui.selectedBuildType, 300);

    assert.equal(applyBuildMenuHotkey(state, "F4"), true);
    assert.equal(state.ui.showBuildMenu, true);

    assert.equal(applyBuildMenuHotkey(state, "3"), true);
    assert.equal(state.ui.showBuildMenu, false);
    assert.equal(state.ui.buildGhostMode, true);
    assert.equal(state.ui.selectedBuildType, 401);
});

test("build menu reflects research progression states", () => {
    const state = createClientState();
    state.local.id = "mayor-1";
    state.local.city = 3;
    state.lobby.assignments = [{ city: 3, mayorId: "mayor-1", recruitCount: 2 }];
    state.ui.selectedBuildType = 300;

    const lines = buildBuildMenuLines(state);
    assert.equal(lines[0], "Build Menu");
    assert.ok(lines.some((line) => line.includes("Role: Mayor")));
    assert.ok(lines.some((line) => line.includes("Housing (300)")));
    assert.ok(lines.some((line) => line.includes("Bazooka Research (401)")));
    assert.ok(lines.every((line) => !line.includes("Laser Factory")));

    state.research.set(3, {
        active: {
            researchType: 412,
            remainingMs: 1200
        },
        completed: []
    });
    const pendingLines = buildBuildMenuLines(state);
    assert.ok(pendingLines.some((line) => line.includes("Laser Factory (researching) (112)")));
    assert.equal(applyBuildMenuHotkey(state, "3"), false);
    assert.equal(state.ui.buildGhostMode, false);

    state.research.set(3, {
        completed: [412]
    });
    const unlockedLines = buildBuildMenuLines(state);
    assert.ok(unlockedLines.some((line) => line.includes("Laser Factory (112)")));
    assert.equal(applyBuildMenuHotkey(state, "3"), true);
    assert.equal(state.ui.selectedBuildType, 112);
    assert.equal(state.ui.buildGhostMode, true);
});

test("build menu keeps child factories locked until research is completed", () => {
    const state = createClientState();
    state.local.id = "mayor-1";
    state.local.city = 3;
    state.lobby.assignments = [{ city: 3, mayorId: "mayor-1", recruitCount: 2 }];
    state.buildings.set("research-1", {
        id: "research-1",
        ownerId: "mayor-1",
        cityId: 3,
        type: 412,
        tileX: 20,
        tileY: 20,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    const lockedLines = buildBuildMenuLines(state);
    assert.ok(lockedLines.every((line) => !line.includes("Laser Factory (112)")));

    state.research.set(3, {
        completed: [412]
    });
    const unlockedLines = buildBuildMenuLines(state);
    assert.ok(unlockedLines.some((line) => line.includes("Laser Factory (112)")));
});

test("build menu UI keeps demolish first and preserves tree order", () => {
    const source = fs.readFileSync(buildMenuPath, "utf8");
    assert.match(source, /list\.appendChild\(demolishRow\);[\s\S]*for \(const entry of entries\) {/);
    assert.doesNotMatch(source, /for \(const entry of \[\.\.\.entries\]\.reverse\(\)\) {/);
    assert.match(source, /createMenuRow\(\s*"Demolish building"/);
});
