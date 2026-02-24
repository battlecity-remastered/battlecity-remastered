import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
    buildBlockingTileSet,
    decodeMapBuffer,
    loadBlockingTiles,
    MAP_SIZE
} from "../src/domain/map/MapService.js";
import {
    buildCitySpawnLookup,
    convertBuildingType,
    loadCityFile,
    loadCityLayoutsFromDirectory
} from "../src/domain/map/CityLayoutService.js";

test("decodeMapBuffer matches legacy axis-flipped indexing", () => {
    const size = MAP_SIZE * MAP_SIZE;
    const bytes = Buffer.alloc(size, 0);

    const targetTileX = 10;
    const targetTileY = 20;
    const sourceX = (MAP_SIZE - 1) - targetTileY;
    const sourceY = (MAP_SIZE - 1) - targetTileX;
    const sourceIndex = sourceX + (sourceY * MAP_SIZE);
    bytes[sourceIndex] = 3;

    const map = decodeMapBuffer(bytes);
    assert.equal(map[targetTileX]?.[targetTileY], 3);
});

test("buildBlockingTileSet includes lava/rock and expands command-center anchors", () => {
    const map = Array.from({ length: MAP_SIZE }, () => new Array<number>(MAP_SIZE).fill(0));
    map[3]![4] = 1;
    map[8]![9] = 2;
    map[13]![14] = 3;

    const blocking = buildBlockingTileSet(map);
    assert.equal(blocking.has("3,4"), true);
    assert.equal(blocking.has("8,9"), true);
    assert.equal(blocking.has("13,14"), true);
    assert.equal(blocking.has("15,16"), true);
    assert.equal(blocking.has("16,16"), false);
});

test("loadBlockingTiles reads map bytes from file", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "battlecity-map-"));
    const mapPath = path.join(tempDir, "map.dat");
    const bytes = Buffer.alloc(MAP_SIZE * MAP_SIZE, 0);

    const targetTileX = 4;
    const targetTileY = 7;
    const sourceX = (MAP_SIZE - 1) - targetTileY;
    const sourceY = (MAP_SIZE - 1) - targetTileX;
    const sourceIndex = sourceX + (sourceY * MAP_SIZE);
    bytes[sourceIndex] = 2;

    fs.writeFileSync(mapPath, bytes);

    const blocking = loadBlockingTiles(mapPath);
    assert.equal(blocking.has("4,7"), true);
});

test("convertBuildingType maps legacy ids to remastered ids", () => {
    assert.equal(convertBuildingType(0), 0);
    assert.equal(convertBuildingType(1), 200);
    assert.equal(convertBuildingType(26), 106);
    assert.equal(convertBuildingType(999), 300);
});

test("loadCityFile parses and offsets against base spawn", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "battlecity-city-"));
    const cityFile = path.join(tempDir, "demo.city");
    fs.writeFileSync(cityFile, "1 416 352\n2 415 351\n");

    const layout = loadCityFile(cityFile, 95, 159);
    assert.equal(layout.length, 2);
    assert.deepEqual(layout[0], { type: 200, dx: 0, dy: 0 });
    assert.deepEqual(layout[1], { type: 300, dx: 1, dy: 1 });
});

test("loadCityFile keeps 511-raw parity transform for edge coordinates", () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "battlecity-city-edge-"));
    const cityFile = path.join(tempDir, "edge.city");
    fs.writeFileSync(cityFile, "1 511 511\n1 0 0\n");

    const layout = loadCityFile(cityFile, 0, 0);
    assert.deepEqual(layout[0], { type: 200, dx: 0, dy: 0 });
    assert.deepEqual(layout[1], { type: 200, dx: 511, dy: 511 });
});

test("loadCityLayoutsFromDirectory reads .city files using spawn lookup", () => {
    const spawnLookup = buildCitySpawnLookup();
    const annaba = spawnLookup.get("annaba");
    assert.ok(annaba);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "battlecity-layouts-"));
    const cityDir = path.join(tempDir, "Annaba");
    fs.mkdirSync(cityDir);
    const cityFile = path.join(cityDir, "annaba1.city");

    // Flips to tile (95, 159), then offset vs Annaba spawn should be 0,0.
    fs.writeFileSync(cityFile, "1 416 352\n");

    const layouts = loadCityLayoutsFromDirectory(tempDir, spawnLookup);
    const layout = layouts.get("Annaba/annaba1.city");
    assert.ok(layout);
    assert.deepEqual(layout?.[0], { type: 200, dx: 0, dy: 0 });
});
