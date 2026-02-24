import type { ClientState } from "../app/state.js";

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

export type ImportedCityBuilding = {
    type: number;
    tileX: number;
    tileY: number;
};

const parseFiniteInt = (raw: string): number | null => {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : null;
};

const convertBuildingType = (originalType: number): number => {
    if (originalType === 0) {
        return 0;
    }
    return ORIGINAL_TO_REMASTERED_TYPE[originalType] ?? 300;
};

export const parseCityImportFile = (content: string): ImportedCityBuilding[] => {
    const lines = content.split("\n");
    const parsed: ImportedCityBuilding[] = [];
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
        parsed.push({
            type: convertBuildingType(originalType),
            tileX: Math.min(MAP_SIZE_TILES - 1, Math.max(0, (MAP_SIZE_TILES - 1) - rawX)),
            tileY: Math.min(MAP_SIZE_TILES - 1, Math.max(0, (MAP_SIZE_TILES - 1) - rawY))
        });
    }
    return parsed;
};

export const applyImportedCityLayout = (
    state: ClientState,
    cityId: number,
    layout: ReadonlyArray<ImportedCityBuilding>
): number => {
    for (const [id, building] of state.buildings.entries()) {
        if (building.cityId === cityId) {
            state.buildings.delete(id);
        }
    }
    for (const [id, defense] of state.defenses.entries()) {
        if (defense.cityId === cityId) {
            state.defenses.delete(id);
        }
    }
    for (const [id, hazard] of state.hazards.entries()) {
        if (hazard.cityId === cityId) {
            state.hazards.delete(id);
        }
    }

    let index = 0;
    for (const entry of layout) {
        const id = `import:${cityId}:${index}`;
        state.buildings.set(id, {
            id,
            ownerId: `import:${cityId}`,
            cityId,
            type: entry.type,
            tileX: entry.tileX,
            tileY: entry.tileY,
            health: 100,
            maxHealth: 100,
            population: 0
        });
        index += 1;
    }
    return layout.length;
};

export const importCityLayoutFromAsset = async (
    state: ClientState,
    cityId: number
): Promise<string> => {
    if (typeof fetch !== "function") {
        return "Import unavailable: fetch not supported";
    }
    const path = `/assets/cities/${cityId}/demo.city`;
    try {
        const response = await fetch(path);
        if (!response.ok) {
            return `Import failed: ${response.status}`;
        }
        const text = await response.text();
        const layout = parseCityImportFile(text);
        const imported = applyImportedCityLayout(state, cityId, layout);
        return `Imported C${cityId}: ${imported} buildings`;
    } catch {
        return "Import failed: network error";
    }
};
