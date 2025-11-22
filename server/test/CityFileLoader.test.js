"use strict";

const CityFileLoader = require('../src/CityFileLoader');
const fs = require('fs');
const path = require('path');

describe('CityFileLoader', () => {
    const testDataDir = path.join(__dirname, 'test-data', 'cities');
    const testCityFile = path.join(testDataDir, 'TestCity', 'test.city');

    beforeAll(() => {
        // Create test directory structure
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        const testCityDir = path.join(testDataDir, 'TestCity');
        if (!fs.existsSync(testCityDir)) {
            fs.mkdirSync(testCityDir);
        }

        // Create a test .city file
        // Format: buildingType x y
        // Command Center at (100, 100), then some buildings around it
        const testContent = `0 100 100
300 103 100
300 106 100
104 103 103
105 106 103
`;
        fs.writeFileSync(testCityFile, testContent, 'utf8');
    });

    afterAll(() => {
        // Clean up test files
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    describe('loadCityFile', () => {
        it('should load and parse a .city file', () => {
            const layout = CityFileLoader.loadCityFile(testCityFile, null, null);

            expect(layout).toBeDefined();
            expect(Array.isArray(layout)).toBe(true);
            expect(layout.length).toBe(5);
        });

        it('should convert absolute coordinates to relative offsets', () => {
            // Base must reflect flip-both: (x,y)->(511 - x, 511 - y). Original 100,100 -> (411, 411)
            const layout = CityFileLoader.loadCityFile(testCityFile, 411, 411);

            // Command Center should be at (0, 0) relative
            const cc = layout.find(b => b.type === 0);
            expect(cc).toBeDefined();
            expect(cc.dx).toBe(0);
            expect(cc.dy).toBe(0);

            // Other buildings should be offset from CC after flip-both
            const house1 = layout.find(b => b.type === 300 && b.dx === -3 && b.dy === 0);
            expect(house1).toBeDefined();

            const house2 = layout.find(b => b.type === 300 && b.dx === -6 && b.dy === 0);
            expect(house2).toBeDefined();
        });

        it('should throw error for non-existent file', () => {
            expect(() => {
                CityFileLoader.loadCityFile('/path/to/nonexistent.city', 0, 0);
            }).toThrow('City file not found');
        });

        it('should skip invalid lines', () => {
            const invalidFile = path.join(testDataDir, 'TestCity', 'invalid.city');
            const invalidContent = `0 100 100
not a number
300 103
300 abc def
`;
            fs.writeFileSync(invalidFile, invalidContent, 'utf8');

            const layout = CityFileLoader.loadCityFile(invalidFile, null, null);
            expect(layout.length).toBe(1); // Only the valid line
        });
    });

    describe('convertToRelativeLayout', () => {
        it('should convert buildings to relative coordinates using base tile when provided', () => {
            const buildings = [
                { type: 0, x: 100, y: 100 },
                { type: 300, x: 103, y: 105 },
                { type: 104, x: 97, y: 100 }
            ];

            const layout = CityFileLoader.convertToRelativeLayout(buildings, 100, 100);

            expect(layout[0]).toEqual({ type: 0, dx: 0, dy: 0 });
            expect(layout[1]).toEqual({ type: 300, dx: 3, dy: 5 });
            expect(layout[2]).toEqual({ type: 104, dx: -3, dy: 0 });
        });

        it('should handle empty array', () => {
            const layout = CityFileLoader.convertToRelativeLayout([], 0, 0);
            expect(layout).toEqual([]);
        });

        it('should fall back to centering when base tile is not provided', () => {
            const buildings = [
                { type: 0, x: 100, y: 100 },
                { type: 300, x: 103, y: 105 },
                { type: 104, x: 97, y: 100 }
            ];

            const layout = CityFileLoader.convertToRelativeLayout(buildings, null, null);
            expect(layout[0]).toEqual({ type: 0, dx: 0, dy: 0 });
            expect(layout[1]).toEqual({ type: 300, dx: 3, dy: 5 });
            expect(layout[2]).toEqual({ type: 104, dx: -3, dy: 0 });
        });
    });

    describe('loadCitiesFromDirectory', () => {
        it('should load all .city files from directory', () => {
            const layouts = CityFileLoader.loadCitiesFromDirectory(testDataDir);

            expect(layouts.size).toBeGreaterThan(0);
            expect(layouts.has('TestCity/test.city')).toBe(true);

            const testLayout = layouts.get('TestCity/test.city');
            expect(testLayout).toBeDefined();
            expect(testLayout.length).toBe(5);
        });

        it('should return empty map for non-existent directory', () => {
            const layouts = CityFileLoader.loadCitiesFromDirectory('/nonexistent/path');
            expect(layouts.size).toBe(0);
        });
    });

    describe('getLayoutsForCity', () => {
        it('should return available layouts for a city name', () => {
            const layouts = new Map([
                ['Luanda/luanda1.city', []],
                ['Luanda/luanda2.city', []],
                ['Annaba/annaba1.city', []],
                ['TestCity/test.city', []]
            ]);

            const luandaLayouts = CityFileLoader.getLayoutsForCity(layouts, 'Luanda');
            expect(luandaLayouts).toHaveLength(2);
            expect(luandaLayouts).toContain('Luanda/luanda1.city');
            expect(luandaLayouts).toContain('Luanda/luanda2.city');
        });

        it('should return empty array if no layouts found', () => {
            const layouts = new Map([['Luanda/luanda1.city', []]]);
            const result = CityFileLoader.getLayoutsForCity(layouts, 'Nonexistent');
            expect(result).toEqual([]);
        });
    });

    describe('pickRandomLayout', () => {
        it('should pick a random layout for a city', () => {
            const layout1 = [{ type: 0, dx: 0, dy: 0 }];
            const layout2 = [{ type: 0, dx: 1, dy: 1 }];
            const layouts = new Map([
                ['Luanda/luanda1.city', layout1],
                ['Luanda/luanda2.city', layout2]
            ]);

            const picked = CityFileLoader.pickRandomLayout(layouts, 'Luanda');
            expect(picked).toBeDefined();
            expect([layout1, layout2]).toContainEqual(picked);
        });

        it('should return null if no layouts available', () => {
            const layouts = new Map();
            const picked = CityFileLoader.pickRandomLayout(layouts, 'Nonexistent');
            expect(picked).toBeNull();
        });
    });
});
