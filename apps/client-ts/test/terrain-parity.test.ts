import test from "node:test";
import assert from "node:assert/strict";
import { resolveGroundOrigin, resolveTerrainFrameOffset, TILE_SIZE } from "../src/render/layers/terrain-parity-helpers.js";
import type { LoadedMap } from "../src/world/map-loader.js";

const buildMapFixture = (mask: number): LoadedMap => {
    const map = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => 0));
    const tileValue = 2;
    map[1]![1] = tileValue;

    const leftSame = (mask & 1) === 0;
    const rightSame = (mask & 2) === 0;
    const downSame = (mask & 4) === 0;
    const upSame = (mask & 8) === 0;

    map[0]![1] = leftSame ? tileValue : 0;
    map[2]![1] = rightSame ? tileValue : 0;
    map[1]![2] = downSame ? tileValue : 0;
    map[1]![0] = upSame ? tileValue : 0;

    return { map, blockingTiles: new Set<string>(), buildBlockingTiles: new Set<string>() };
};

test("terrain adjacency bitmask frame offset matches all 16 parity cases", () => {
    for (let mask = 0; mask < 16; mask += 1) {
        const mapData = buildMapFixture(mask);
        const offset = resolveTerrainFrameOffset(mapData, 1, 1, 2);
        assert.equal(offset, mask * TILE_SIZE, `mask=${mask}`);
    }
});

test("ground origin uses modulo camera placement parity", () => {
    assert.deepEqual(resolveGroundOrigin(6000, 6100), { x: 5888, y: 6016 });
    assert.deepEqual(resolveGroundOrigin(-1, -129), { x: -128, y: -256 });
});
