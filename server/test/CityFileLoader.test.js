"use strict";

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const CityFileLoader = require("../src/CityFileLoader");

describe("CityFileLoader", () => {
    const testDataDir = path.join(__dirname, "test-data", "cities");
    const testCityFile = path.join(testDataDir, "TestCity", "test.city");

    before(() => {
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        const testCityDir = path.join(testDataDir, "TestCity");
        if (!fs.existsSync(testCityDir)) {
            fs.mkdirSync(testCityDir);
        }

        const testContent = `0 100 100
300 103 100
300 106 100
104 103 103
105 106 103
`;
        fs.writeFileSync(testCityFile, testContent, "utf8");
    });

    after(() => {
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    describe("loadCityFile", () => {
        it("should load and parse a .city file", () => {
            const layout = CityFileLoader.loadCityFile(testCityFile, null, null);

            assert.ok(layout);
            assert.ok(Array.isArray(layout));
            assert.equal(layout.length, 5);
        });

        it("should convert absolute coordinates to relative offsets", () => {
            const layout = CityFileLoader.loadCityFile(testCityFile, 411, 411);

            const cc = layout.find((b) => b.type === 0);
            assert.ok(cc);
            assert.equal(cc.dx, 0);
            assert.equal(cc.dy, 0);

            const house1 = layout.find((b) => b.type === 300 && b.dx === -3 && b.dy === 0);
            assert.ok(house1);

            const house2 = layout.find((b) => b.type === 300 && b.dx === -6 && b.dy === 0);
            assert.ok(house2);
        });

        it("should throw error for non-existent file", () => {
            assert.throws(
                () => CityFileLoader.loadCityFile("/path/to/nonexistent.city", 0, 0),
                /City file not found/
            );
        });

        it("should skip invalid lines", () => {
            const invalidFile = path.join(testDataDir, "TestCity", "invalid.city");
            const invalidContent = `0 100 100
not a number
300 103
300 abc def
`;
            fs.writeFileSync(invalidFile, invalidContent, "utf8");

            const layout = CityFileLoader.loadCityFile(invalidFile, null, null);
            assert.equal(layout.length, 1);
        });
    });

    describe("convertToRelativeLayout", () => {
        it("should convert buildings to relative coordinates using base tile when provided", () => {
            const buildings = [
                { type: 0, x: 100, y: 100 },
                { type: 300, x: 103, y: 105 },
                { type: 104, x: 97, y: 100 }
            ];

            const layout = CityFileLoader.convertToRelativeLayout(buildings, 100, 100);

            assert.deepStrictEqual(layout[0], { type: 0, dx: 0, dy: 0 });
            assert.deepStrictEqual(layout[1], { type: 300, dx: 3, dy: 5 });
            assert.deepStrictEqual(layout[2], { type: 104, dx: -3, dy: 0 });
        });

        it("should handle empty array", () => {
            const layout = CityFileLoader.convertToRelativeLayout([], 0, 0);
            assert.deepStrictEqual(layout, []);
        });

        it("should fall back to centering when base tile is not provided", () => {
            const buildings = [
                { type: 0, x: 100, y: 100 },
                { type: 300, x: 103, y: 105 },
                { type: 104, x: 97, y: 100 }
            ];

            const layout = CityFileLoader.convertToRelativeLayout(buildings, null, null);
            assert.deepStrictEqual(layout[0], { type: 0, dx: 0, dy: -2 });
            assert.deepStrictEqual(layout[1], { type: 300, dx: 3, dy: 3 });
            assert.deepStrictEqual(layout[2], { type: 104, dx: -3, dy: -2 });
        });
    });

    describe("loadCitiesFromDirectory", () => {
        it("should load all .city files from directory", () => {
            const layouts = CityFileLoader.loadCitiesFromDirectory(testDataDir);

            assert.ok(layouts.size > 0);
            assert.ok(layouts.has("TestCity/test.city"));

            const testLayout = layouts.get("TestCity/test.city");
            assert.ok(testLayout);
            assert.equal(testLayout.length, 5);
        });

        it("should return empty map for non-existent directory", () => {
            const layouts = CityFileLoader.loadCitiesFromDirectory("/nonexistent/path");
            assert.equal(layouts.size, 0);
        });
    });

    describe("getLayoutsForCity", () => {
        it("should return available layouts for a city name", () => {
            const layouts = new Map([
                ["Luanda/luanda1.city", []],
                ["Luanda/luanda2.city", []],
                ["Annaba/annaba1.city", []],
                ["TestCity/test.city", []]
            ]);

            const luandaLayouts = CityFileLoader.getLayoutsForCity(layouts, "Luanda");
            assert.equal(luandaLayouts.length, 2);
            assert.ok(luandaLayouts.includes("Luanda/luanda1.city"));
            assert.ok(luandaLayouts.includes("Luanda/luanda2.city"));
        });

        it("should return empty array if no layouts found", () => {
            const layouts = new Map([["Luanda/luanda1.city", []]]);
            const result = CityFileLoader.getLayoutsForCity(layouts, "Nonexistent");
            assert.deepStrictEqual(result, []);
        });
    });

    describe("pickRandomLayout", () => {
        it("should pick a random layout for a city", () => {
            const layout1 = [{ type: 0, dx: 0, dy: 0 }];
            const layout2 = [{ type: 0, dx: 1, dy: 1 }];
            const layouts = new Map([
                ["Luanda/luanda1.city", layout1],
                ["Luanda/luanda2.city", layout2]
            ]);

            const picked = CityFileLoader.pickRandomLayout(layouts, "Luanda");
            assert.ok(picked);
            assert.ok([layout1, layout2].includes(picked));
        });

        it("should return null if no layouts available", () => {
            const layouts = new Map();
            const picked = CityFileLoader.pickRandomLayout(layouts, "Nonexistent");
            assert.equal(picked, null);
        });
    });
});
