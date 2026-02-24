import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { ITEM_TYPE_IDS } from "../src/render/parity/constants.js";

test("canonical item type ids match legacy ordering", () => {
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
        "apps/client-ts/src/app/intents-actions.ts",
        "apps/client-ts/src/gameplay/items/IconInventoryService.ts",
        "apps/client-ts/src/render/items/ItemRenderer.ts",
        "apps/client-ts/src/render/scene.ts"
    ];

    for (const target of targets) {
        const source = readFileSync(resolve(process.cwd(), target), "utf8");
        assert.equal(/const\s+ITEM_TYPE_[A-Z0-9_]+\s*=/.test(source), false, target);
    }
});
