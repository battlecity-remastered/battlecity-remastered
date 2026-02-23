import test from "node:test";
import assert from "node:assert/strict";
import { allAssetPaths, assetManifest } from "../src/assets/manifest.js";

test("asset manifest includes map, sprites and audio", () => {
    const paths = allAssetPaths();

    assert.equal(paths.includes(assetManifest.mapData), true);
    assert.equal(assetManifest.spriteSheets.length > 0, true);
    assert.equal(assetManifest.audio.length > 0, true);
});
