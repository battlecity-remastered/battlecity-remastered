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
    assert.equal(decoded.buildBlockingTiles.has("0,0"), true);
    assert.equal(decoded.buildBlockingTiles.has("0,1"), true);
});

test("decodeMapData splits movement-vs-build blocking for command-center anchors", () => {
    const bytes = new Uint8Array(MAP_SIZE * MAP_SIZE);
    bytes[(MAP_SIZE - 1) + ((MAP_SIZE - 1) * MAP_SIZE)] = 3;

    const decoded = decodeMapData(bytes);

    for (let x = 0; x < 3; x += 1) {
        for (let y = 0; y < 2; y += 1) {
            assert.equal(decoded.blockingTiles.has(`${x},${y}`), true);
        }
    }
    assert.equal(decoded.blockingTiles.has("0,2"), false);
    for (let x = 0; x < 3; x += 1) {
        for (let y = 0; y < 3; y += 1) {
            assert.equal(decoded.buildBlockingTiles.has(`${x},${y}`), true);
        }
    }
});
