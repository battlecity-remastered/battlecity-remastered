export const MAP_SIZE = 512;

export type LoadedMap = {
    map: number[][];
    blockingTiles: Set<string>;
};

const buildEmptyMap = (): number[][] => {
    return Array.from({ length: MAP_SIZE }, () => Array.from({ length: MAP_SIZE }, () => 0));
};

const decodeMapBuffer = (buffer: Uint8Array): number[][] => {
    const map = buildEmptyMap();
    if (buffer.length < MAP_SIZE * MAP_SIZE) {
        return map;
    }

    for (let x = 0; x < MAP_SIZE; x += 1) {
        for (let y = 0; y < MAP_SIZE; y += 1) {
            const sourceX = (MAP_SIZE - 1) - y;
            const sourceY = (MAP_SIZE - 1) - x;
            const sourceIndex = sourceX + (sourceY * MAP_SIZE);
            map[x]![y] = buffer[sourceIndex] ?? 0;
        }
    }
    return map;
};

const buildBlockingTiles = (map: number[][]): Set<string> => {
    const blocking = new Set<string>();
    for (let x = 0; x < map.length; x += 1) {
        const column = map[x];
        if (!column) {
            continue;
        }
        for (let y = 0; y < column.length; y += 1) {
            const value = column[y] ?? 0;
            if (value === 2 || value === 3) {
                blocking.add(`${x},${y}`);
            }
        }
    }
    return blocking;
};

export const decodeMapData = (bytes: Uint8Array): LoadedMap => {
    const map = decodeMapBuffer(bytes);
    return {
        map,
        blockingTiles: buildBlockingTiles(map)
    };
};

export const loadMapData = async (path = "/assets/map.dat"): Promise<LoadedMap> => {
    if (typeof fetch !== "function") {
        return {
            map: buildEmptyMap(),
            blockingTiles: new Set<string>()
        };
    }

    try {
        const response = await fetch(path);
        if (!response.ok) {
            throw new Error(`map fetch failed: ${response.status}`);
        }
        const buffer = new Uint8Array(await response.arrayBuffer());
        return decodeMapData(buffer);
    } catch {
        return {
            map: buildEmptyMap(),
            blockingTiles: new Set<string>()
        };
    }
};
