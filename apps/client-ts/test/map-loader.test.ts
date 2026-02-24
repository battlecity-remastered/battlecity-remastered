import test from "node:test";
import assert from "node:assert/strict";
import { decodeMapData, MAP_SIZE } from "../src/world/map-loader.js";

test("decodeMapData preserves legacy axis flip orientation", () => {
    const bytes = new Uint8Array(MAP_SIZE * MAP_SIZE);
    bytes[(MAP_SIZE - 1) + ((MAP_SIZE - 1) * MAP_SIZE)] = 1;
    bytes[(MAP_SIZE - 2) + ((MAP_SIZE - 1) * MAP_SIZE)] = 2;

    const decoded = decodeMapData(bytes);

    assert.equal(decoded.map[0]?.[0], 1);
    assert.equal(decoded.map[0]?.[1], 2);
    assert.equal(decoded.blockingTiles.has("0,0"), true);
    assert.equal(decoded.blockingTiles.has("0,1"), true);
});
