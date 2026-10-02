import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ITEM_TYPE_IDS } from "../src/render/parity/constants.js";

test("canonical item type ids match classic ordering", () => {
    assert.deepEqual(ITEM_TYPE_IDS, {
        cloak: 0,
        rocket: 1,
        medkit: 2,
        bomb: 3,
        mine: 4,
        orb: 5,
        flare: 6,
        dfg: 7,
        wall: 8,
        turret: 9,
        sleeper: 10,
        plasma: 11,
        laser: 12
    });
});

test("no local item id constant redefinitions remain in intents/inventory/render paths", () => {
    const targets = [
        "../src/app/intents-actions.ts",
        "../src/gameplay/items/IconInventoryService.ts",
        "../src/render/three/inventory-model.ts",
        "../src/render/three/industrial-demo.ts"
    ];

    for (const target of targets) {
        const source = readFileSync(new URL(target, import.meta.url), "utf8");
        assert.equal(/const\s+ITEM_TYPE_[A-Z0-9_]+\s*=/.test(source), false, target);
    }
});
