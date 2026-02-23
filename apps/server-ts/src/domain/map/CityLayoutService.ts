import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import citySpawns from "../../../data/citySpawns.json" with { type: "json" };

export type RelativeLayoutEntry = {
    type: number;
    dx: number;
    dy: number;
};

const MAP_SIZE_TILES = 512;

const ORIGINAL_TO_REMASTERED_TYPE: Record<number, number> = {
    1: 200,
    2: 300,
    3: 400,
    4: 100,
    5: 409,
    6: 109,
    7: 403,
    8: 103,
    9: 402,
    10: 102,
    11: 411,
    12: 111,
    13: 404,
    14: 104,
    15: 405,
    16: 105,
    17: 401,
    18: 101,
    19: 410,
    20: 110,
    21: 408,
    22: 108,
    23: 407,
    24: 107,
    25: 406,
    26: 106
};

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_CITY_LAYOUT_ROOT = path.resolve(moduleDir, "../../../data/cities");

export const convertBuildingType = (originalType: number): number => {
    if (originalType === 0) {
        return 0;
    }
    return ORIGINAL_TO_REMASTERED_TYPE[originalType] ?? 300;
};

const parseFiniteInt = (raw: string): number | null => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const toRelativeLayout = (
    buildings: Array<{ type: number; x: number; y: number }>,
    baseTileX?: number,
    baseTileY?: number
): RelativeLayoutEntry[] => {
    if (buildings.length === 0) {
        return [];
    }

    if (
        baseTileX !== undefined
        && baseTileY !== undefined
        && Number.isFinite(baseTileX)
        && Number.isFinite(baseTileY)
    ) {
        const normalizedBaseX = Math.floor(baseTileX);
        const normalizedBaseY = Math.floor(baseTileY);
        return buildings.map((building) => ({
            type: building.type,
            dx: building.x - normalizedBaseX,
            dy: building.y - normalizedBaseY
        }));
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const building of buildings) {
        minX = Math.min(minX, building.x);
        minY = Math.min(minY, building.y);
        maxX = Math.max(maxX, building.x);
        maxY = Math.max(maxY, building.y);
    }

    const centerX = Math.floor((minX + maxX) / 2);
    const centerY = Math.floor((minY + maxY) / 2);

    return buildings.map((building) => ({
        type: building.type,
        dx: building.x - centerX,
        dy: building.y - centerY
    }));
};

export const loadCityFile = (
    filePath: string,
    baseTileX?: number,
    baseTileY?: number
): RelativeLayoutEntry[] => {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split("\n");

    const buildings: Array<{ type: number; x: number; y: number }> = [];
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.length === 0) {
            continue;
        }

        const parts = line.split(/\s+/);
        if (parts.length < 3) {
            continue;
        }

        const originalType = parseFiniteInt(parts[0]!);
        const rawX = parseFiniteInt(parts[1]!);
        const rawY = parseFiniteInt(parts[2]!);
        if (originalType === null || rawX === null || rawY === null) {
            continue;
        }

        const x = (MAP_SIZE_TILES - 1) - rawX;
        const y = (MAP_SIZE_TILES - 1) - rawY;
        buildings.push({
            type: convertBuildingType(originalType),
            x,
            y
        });
    }

    return toRelativeLayout(buildings, baseTileX, baseTileY);
};

const normalizeCityName = (value: string): string => {
    return value.trim().toLowerCase();
};

export const buildCitySpawnLookup = (): Map<string, { tileX: number; tileY: number }> => {
    const lookup = new Map<string, { tileX: number; tileY: number }>();
    for (const spawn of Object.values(citySpawns)) {
        if (!spawn || typeof spawn !== "object") {
            continue;
        }
        const name = "name" in spawn ? spawn.name : undefined;
        const tileX = "tileX" in spawn ? Number(spawn.tileX) : NaN;
        const tileY = "tileY" in spawn ? Number(spawn.tileY) : NaN;
        if (typeof name !== "string" || !Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            continue;
        }
        lookup.set(normalizeCityName(name), {
            tileX: Math.floor(tileX),
            tileY: Math.floor(tileY)
        });
    }
    return lookup;
};

export const loadCityLayoutsFromDirectory = (
    rootDirectory = DEFAULT_CITY_LAYOUT_ROOT,
    spawnLookup = buildCitySpawnLookup()
): Map<string, RelativeLayoutEntry[]> => {
    const layouts = new Map<string, RelativeLayoutEntry[]>();
    if (!fs.existsSync(rootDirectory)) {
        return layouts;
    }

    const cityFolders = fs.readdirSync(rootDirectory, { withFileTypes: true }).filter((entry) => entry.isDirectory());
    for (const cityFolder of cityFolders) {
        const cityFolderPath = path.join(rootDirectory, cityFolder.name);
        const files = fs.readdirSync(cityFolderPath).filter((entry) => entry.endsWith(".city"));
        const base = spawnLookup.get(normalizeCityName(cityFolder.name));

        for (const file of files) {
            const filePath = path.join(cityFolderPath, file);
            const key = `${cityFolder.name}/${file}`;
            const layout = loadCityFile(filePath, base?.tileX, base?.tileY);
            layouts.set(key, layout);
        }
    }

    return layouts;
};

export const cityLayoutDefaults = {
    defaultRoot: DEFAULT_CITY_LAYOUT_ROOT
};
