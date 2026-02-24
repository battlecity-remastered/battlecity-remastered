import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MAP_SIZE = 512;
export const MAP_SQUARE_LAVA = 1;
export const MAP_SQUARE_ROCK = 2;
export const MAP_SQUARE_BUILDING = 3;
const COMMAND_CENTER_FOOTPRINT_TILES = 3;

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_MAP_DATA_PATH = path.resolve(moduleDir, "../../../data/map.dat");

const buildEmptyMap = (): number[][] => {
    const map: number[][] = [];
    for (let x = 0; x < MAP_SIZE; x += 1) {
        const column = new Array<number>(MAP_SIZE);
        column.fill(0);
        map.push(column);
    }
    return map;
};

const ensureBuffer = (data: Buffer | string | Uint8Array | null): Buffer | null => {
    if (data === null) {
        return null;
    }
    if (Buffer.isBuffer(data)) {
        return data;
    }
    if (typeof data === "string") {
        return Buffer.from(data, "binary");
    }
    return Buffer.from(data);
};

export const decodeMapBuffer = (buffer: Buffer | string | Uint8Array | null): number[][] => {
    const normalized = ensureBuffer(buffer);
    const map = buildEmptyMap();
    if (!normalized || normalized.length === 0) {
        return map;
    }

    const view = new Uint8Array(normalized);
    const total = MAP_SIZE * MAP_SIZE;
    if (view.length < total) {
        return map;
    }

    for (let x = 0; x < MAP_SIZE; x += 1) {
        for (let y = 0; y < MAP_SIZE; y += 1) {
            const sourceX = (MAP_SIZE - 1) - y;
            const sourceY = (MAP_SIZE - 1) - x;
            const index = sourceX + (sourceY * MAP_SIZE);
            map[x]![y] = view[index] ?? 0;
        }
    }
    return map;
};

export const loadMapData = (mapDataPath = DEFAULT_MAP_DATA_PATH): number[][] => {
    try {
        const buffer = fs.readFileSync(mapDataPath);
        return decodeMapBuffer(buffer);
    } catch {
        return buildEmptyMap();
    }
};

export const buildBlockingTileSet = (map: number[][]): Set<string> => {
    const blockingTiles = new Set<string>();
    for (let tileX = 0; tileX < MAP_SIZE; tileX += 1) {
        const column = map[tileX];
        if (!Array.isArray(column)) {
            continue;
        }
        for (let tileY = 0; tileY < MAP_SIZE; tileY += 1) {
            const value = column[tileY] ?? 0;
            if (value === MAP_SQUARE_LAVA || value === MAP_SQUARE_ROCK) {
                blockingTiles.add(`${tileX},${tileY}`);
                continue;
            }
            if (value !== MAP_SQUARE_BUILDING) {
                continue;
            }
            for (let dx = 0; dx < COMMAND_CENTER_FOOTPRINT_TILES; dx += 1) {
                for (let dy = 0; dy < COMMAND_CENTER_FOOTPRINT_TILES; dy += 1) {
                    const x = tileX + dx;
                    const y = tileY + dy;
                    if (x < 0 || y < 0 || x >= MAP_SIZE || y >= MAP_SIZE) {
                        continue;
                    }
                    blockingTiles.add(`${x},${y}`);
                }
            }
        }
    }
    return blockingTiles;
};

export const loadBlockingTiles = (mapDataPath?: string): Set<string> => {
    const map = loadMapData(mapDataPath ?? DEFAULT_MAP_DATA_PATH);
    return buildBlockingTileSet(map);
};

export const mapDataDefaults = {
    defaultPath: DEFAULT_MAP_DATA_PATH
};
