import test from "node:test";
import assert from "node:assert/strict";
import { decodeMapData, MAP_SIZE as CLIENT_MAP_SIZE } from "../../client-ts/src/world/map-loader.js";
import { buildBlockingTileSet, decodeMapBuffer, MAP_SIZE as SERVER_MAP_SIZE } from "../src/domain/map/MapService.js";

test("client and server produce equivalent blocking tiles for same map bytes", () => {
    assert.equal(CLIENT_MAP_SIZE, SERVER_MAP_SIZE);

    const size = CLIENT_MAP_SIZE * CLIENT_MAP_SIZE;
    const bytes = new Uint8Array(size);

    const setTile = (tileX: number, tileY: number, value: number): void => {
        const sourceX = (CLIENT_MAP_SIZE - 1) - tileY;
        const sourceY = (CLIENT_MAP_SIZE - 1) - tileX;
        const index = sourceX + (sourceY * CLIENT_MAP_SIZE);
        bytes[index] = value;
    };

    setTile(1, 2, 1);
    setTile(4, 5, 2);
    setTile(10, 10, 3);

    const clientBlocking = decodeMapData(bytes).blockingTiles;
    const serverMap = decodeMapBuffer(bytes);
    const serverBlocking = buildBlockingTileSet(serverMap);

    assert.deepEqual([...serverBlocking].sort(), [...clientBlocking].sort());
});
