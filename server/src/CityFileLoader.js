"use strict";

const fs = require('fs');
const path = require('path');

/**
 * Mapping from original Battle City building type codes to remastered codes
 * Based on buildingTypes array from original/Battle-City/client/Structs.cpp:106
 * Original: buildingTypes[] = {200,300,400,100,409,109,403,103,402,102,411,111,404,104,405,105,401,101,410,110,408,108,407,107,406,106};
 * Index 1-26 maps to: Hospital, House, Laser Research, Laser Factory, etc.
 */
const ORIGINAL_TO_REMASTERED_TYPE = {
    1: 200,  // Hospital
    2: 300,  // House
    3: 400,  // Laser Research
    4: 100,  // Laser Factory
    5: 409,  // Turret Research
    6: 109,  // Turret Factory
    7: 403,  // Time Bomb Research
    8: 103,  // Time Bomb Factory
    9: 402,  // MedKit Research
    10: 102, // MedKit Factory
    11: 411, // Plasma Turret Research
    12: 111, // Plasma Turret Factory
    13: 404, // Mine Research
    14: 104, // Mine Factory
    15: 405, // Orb Research
    16: 105, // Orb Factory
    17: 401, // Bazooka Research
    18: 101, // Bazooka Factory
    19: 410, // Sleeper Research
    20: 110, // Sleeper Factory
    21: 408, // Wall Research
    22: 108, // Wall Factory
    23: 407, // DFG Research
    24: 107, // DFG Factory
    25: 406, // Flare Gun Research
    26: 106, // Flare Gun Factory
};

/**
 * Convert original game building type to remastered type
 * @param {number} originalType - Original game building type
 * @returns {number} - Remastered game building type
 */
function convertBuildingType(originalType) {
    return ORIGINAL_TO_REMASTERED_TYPE[originalType] || 300; // Default to house
}

/**
 * CityFileLoader
 * 
 * Utility class to load and parse .city files from the original Battle City game.
 * Converts absolute tile coordinates to relative offsets for use with FakeCityManager.
 * 
 * .city file format:
 *   Each line: buildingType x y
 *   - buildingType: Integer building type ID (0=CC, 300=House, 100/400-series=Factories/Research)
 *   - x, y: Absolute tile coordinates on 512x512 map
 */
const MAP_SIZE_TILES = 512;
class CityFileLoader {
    /**
     * Load and parse a single .city file
     * @param {string} filePath - Absolute path to .city file
     * @param {number} baseTileX - Base X coordinate for city spawn
     * @param {number} baseTileY - Base Y coordinate for city spawn
     * @returns {Array<{type: number, dx: number, dy: number}>} - Building layout
     */
    static loadCityFile(filePath, baseTileX = null, baseTileY = null) {
        if (!fs.existsSync(filePath)) {
            throw new Error(`City file not found: ${filePath}`);
        }

        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n').filter(line => line.trim().length > 0);

        const buildings = [];
        for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length < 3) {
                continue; // Skip invalid lines
            }

            const type = parseInt(parts[0], 10);
            // Flip both axes to match mapBuilder/mapLoader ((size - 1) - index)
            const x = (MAP_SIZE_TILES - 1) - parseInt(parts[1], 10);
            const y = (MAP_SIZE_TILES - 1) - parseInt(parts[2], 10);

            if (!Number.isFinite(type) || !Number.isFinite(x) || !Number.isFinite(y)) {
                continue; // Skip lines with invalid numbers
            }

            // Convert original game building type to remastered type
            const remasteredType = convertBuildingType(type);
            buildings.push({ type: remasteredType, x, y });
        }

        return this.convertToRelativeLayout(buildings, baseTileX, baseTileY);
    }

    /**
     * Convert absolute coordinates to relative offsets
     * @param {Array<{type: number, x: number, y: number}>} buildings - Buildings with absolute coords
     * @param {number} baseTileX - Base X coordinate (unused, kept for compatibility)
     * @param {number} baseTileY - Base Y coordinate (unused, kept for compatibility)
     * @returns {Array<{type: number, dx: number, dy: number}>} - Buildings with relative coords
     */
    static convertToRelativeLayout(buildings, baseTileX, baseTileY) {
        if (!Array.isArray(buildings) || buildings.length === 0) {
            return [];
        }

        const hasBase =
            Number.isFinite(baseTileX) &&
            Number.isFinite(baseTileY);

        if (hasBase) {
            return buildings.map((building) => ({
                type: building.type,
                dx: building.x - Math.floor(baseTileX),
                dy: building.y - Math.floor(baseTileY)
            }));
        }

        // Fallback: center the cluster if no base location provided
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const building of buildings) {
            if (building.x < minX) minX = building.x;
            if (building.y < minY) minY = building.y;
            if (building.x > maxX) maxX = building.x;
            if (building.y > maxY) maxY = building.y;
        }
        const centerX = Math.floor((minX + maxX) / 2);
        const centerY = Math.floor((minY + maxY) / 2);

        return buildings.map(building => ({
            type: building.type,
            dx: building.x - centerX,
            dy: building.y - centerY
        }));
    }

    /**
     * Load all .city files from a directory
     * @param {string} dirPath - Directory path containing city folders
     * @returns {Map<string, Array>} - Map of city name to layouts
     */
    static loadCitiesFromDirectory(dirPath, spawnLookup = null) {
        const layouts = new Map();

        if (!fs.existsSync(dirPath)) {
            console.warn(`[CityFileLoader] Directory not found: ${dirPath}`);
            return layouts;
        }

        const cityFolders = fs.readdirSync(dirPath, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);

        for (const cityFolder of cityFolders) {
            const cityPath = path.join(dirPath, cityFolder);
            const files = fs.readdirSync(cityPath)
                .filter(file => file.endsWith('.city'));

            const key = cityFolder.toLowerCase();
            const baseCoords = spawnLookup && spawnLookup.get
                ? spawnLookup.get(key)
                : (spawnLookup && spawnLookup[key]);
            const baseTileX = baseCoords?.tileX;
            const baseTileY = baseCoords?.tileY;

            for (const file of files) {
                const filePath = path.join(cityPath, file);
                const layoutName = `${cityFolder}/${file}`;

                try {
                    const layout = this.loadCityFile(filePath, baseTileX, baseTileY);
                    layouts.set(layoutName, layout);
                    console.log(`[CityFileLoader] Loaded ${layoutName}: ${layout.length} buildings`);
                } catch (error) {
                    console.error(`[CityFileLoader] Failed to load ${layoutName}:`, error.message);
                }
            }
        }

        return layouts;
    }

    /**
     * Get available city layouts for a city name
     * @param {Map<string, Array>} layouts - Loaded layouts map
     * @param {string} cityName - City name (e.g., "Luanda", "Annaba")
     * @returns {Array<string>} - Available layout keys for this city
     */
    static getLayoutsForCity(layouts, cityName) {
        const keys = Array.from(layouts.keys());
        return keys.filter(key => key.startsWith(`${cityName}/`));
    }

    /**
     * Pick a random layout for a city
     * @param {Map<string, Array>} layouts - Loaded layouts map
     * @param {string} cityName - City name
     * @returns {Array|null} - Random layout or null if none found
     */
    static pickRandomLayout(layouts, cityName) {
        const availableLayouts = this.getLayoutsForCity(layouts, cityName);
        if (availableLayouts.length === 0) {
            return null;
        }

        const randomKey = availableLayouts[Math.floor(Math.random() * availableLayouts.length)];
        return layouts.get(randomKey);
    }
}

module.exports = CityFileLoader;
