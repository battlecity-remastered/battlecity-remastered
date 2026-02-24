import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { basename, resolve } from "node:path";
import { LEGACY_TEXTURE_PATHS, parityTextureKeys } from "../src/render/parity/texture-paths.js";

const assetsDir = resolve(process.cwd(), "apps/client-ts/public/assets");

test("legacy texture registry exposes full parity texture key set", () => {
    const keys = parityTextureKeys();
    const expected = [
        "turretHead",
        "miniMapColors",
        "arrows",
        "arrowsRed",
        "moneyBox",
        "blackNumbers",
        "inventorySelection",
        "largeExplosion",
        "buildIcons"
    ];

    for (const key of expected) {
        assert.equal(keys.includes(key as (typeof keys)[number]), true, key);
    }
});

test("all registered parity textures point to files that exist in public assets", () => {
    for (const [key, path] of Object.entries(LEGACY_TEXTURE_PATHS)) {
        const filePath = resolve(assetsDir, basename(path));
        assert.equal(existsSync(filePath), true, `${key}:${path}`);
    }
});
