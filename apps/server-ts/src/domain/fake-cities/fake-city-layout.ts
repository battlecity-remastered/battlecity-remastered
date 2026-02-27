import type { FakeCityConfigEntry, FakeCityLayoutEntry } from "./fake-city-model.js";
import {
    asFiniteNumber,
    ensureBaseCommandCenter,
    pickCuratedLayoutForCity,
    resolveBlueprintSize,
    fakeCityConfig
} from "./fake-city-model.js";

export const calculateLayoutBounds = (
    layout: FakeCityLayoutEntry[],
    baseTileX: number,
    baseTileY: number
): { minTileX: number; maxTileX: number; minTileY: number; maxTileY: number } => {
    let minTileX = baseTileX;
    let maxTileX = baseTileX;
    let minTileY = baseTileY;
    let maxTileY = baseTileY;

    for (const blueprint of layout) {
        const dx = asFiniteNumber(blueprint.dx, 0);
        const dy = asFiniteNumber(blueprint.dy, 0);
        const tileX = Math.floor(baseTileX + dx);
        const tileY = Math.floor(baseTileY + dy);
        const { width, height } = resolveBlueprintSize(asFiniteNumber(blueprint.type, Number.NaN));
        minTileX = Math.min(minTileX, tileX);
        minTileY = Math.min(minTileY, tileY);
        maxTileX = Math.max(maxTileX, tileX + Math.max(0, width - 1));
        maxTileY = Math.max(maxTileY, tileY + Math.max(0, height - 1));
    }

    return { minTileX, maxTileX, minTileY, maxTileY };
};

export const createLayoutOccupiedSet = (
    layout: FakeCityLayoutEntry[],
    baseTileX: number,
    baseTileY: number
): Set<string> => {
    const occupied = new Set<string>();
    for (const blueprint of layout) {
        const dx = asFiniteNumber(blueprint.dx, 0);
        const dy = asFiniteNumber(blueprint.dy, 0);
        const tileX = Math.floor(baseTileX + dx);
        const tileY = Math.floor(baseTileY + dy);
        const { width, height } = resolveBlueprintSize(asFiniteNumber(blueprint.type, Number.NaN));
        for (let ox = 0; ox < width; ox += 1) {
            for (let oy = 0; oy < height; oy += 1) {
                occupied.add(`${tileX + ox}_${tileY + oy}`);
            }
        }
    }
    return occupied;
};

export const resolveFakeCityLayout = (
    entry: FakeCityConfigEntry,
    spawnName: string | undefined
): FakeCityLayoutEntry[] => {
    const curatedLayout = pickCuratedLayoutForCity(spawnName);
    const selectedLayout = (Array.isArray(curatedLayout) && curatedLayout.length > 0)
        ? curatedLayout
        : ((Array.isArray(entry.layout) && entry.layout.length > 0)
            ? entry.layout
            : (Array.isArray(fakeCityConfig.layout) ? fakeCityConfig.layout : []));
    return ensureBaseCommandCenter(selectedLayout);
};
