import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { calculateLayoutBounds, createLayoutOccupiedSet } from "./fake-city-layout.js";
import type { FakeCityDefenseEntry, FakeCityLayoutEntry } from "./fake-city-model.js";
import {
    COMMAND_CENTER_HEIGHT_TILES,
    COMMAND_CENTER_WIDTH_TILES,
    asFiniteNumber,
    clampTile,
    mapMaxTileFromConfig
} from "./fake-city-model.js";

type HazardCandidate = {
    tileX: number;
    tileY: number;
};

type HazardCandidateCollectionContext = {
    state: RuntimeState;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    occupiedTiles: Set<string>;
    placedTiles: Set<string>;
    candidateKeys: Set<string>;
    candidates: HazardCandidate[];
};

const shuffleInPlace = <T>(values: T[]): void => {
    for (let index = values.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        if (swapIndex === index) {
            continue;
        }
        const current = values[index];
        values[index] = values[swapIndex] as T;
        values[swapIndex] = current as T;
    }
};

const generateCommandCenterDefenses = (): FakeCityDefenseEntry[] => {
    const defenses: FakeCityDefenseEntry[] = [];

    for (let dx = 0; dx < COMMAND_CENTER_WIDTH_TILES; dx += 1) {
        defenses.push({
            type: "wall",
            dx,
            dy: COMMAND_CENTER_HEIGHT_TILES,
            allowOverlap: false
        });
    }

    defenses.push({ type: "mine", dx: 0.5, dy: COMMAND_CENTER_HEIGHT_TILES + 0.5 });
    defenses.push({ type: "mine", dx: 2.5, dy: COMMAND_CENTER_HEIGHT_TILES + 0.5 });
    defenses.push({ type: "turret", dx: -1, dy: COMMAND_CENTER_HEIGHT_TILES, angle: 8 });
    defenses.push({ type: "turret", dx: COMMAND_CENTER_WIDTH_TILES, dy: COMMAND_CENTER_HEIGHT_TILES, angle: 24 });
    defenses.push({ type: "plasma", dx: -1, dy: 0, angle: 16 });
    defenses.push({ type: "plasma", dx: COMMAND_CENTER_WIDTH_TILES, dy: 0, angle: 16 });

    return defenses;
};

const buildCcOccupiedTiles = (
    baseTileX: number,
    baseTileY: number,
    ccDefenses: FakeCityDefenseEntry[],
    mapMaxTile: number
): Set<string> => {
    const occupied = new Set<string>();

    for (let ox = 0; ox < COMMAND_CENTER_WIDTH_TILES; ox += 1) {
        for (let oy = 0; oy < COMMAND_CENTER_HEIGHT_TILES; oy += 1) {
            occupied.add(`${baseTileX + ox}_${baseTileY + oy}`);
        }
    }

    for (const defense of ccDefenses) {
        const dx = asFiniteNumber(defense.dx, Number.NaN);
        const dy = asFiniteNumber(defense.dy, Number.NaN);
        if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
            continue;
        }
        const tileX = Math.floor(baseTileX + dx);
        const tileY = Math.floor(baseTileY + dy);
        occupied.add(`${tileX}_${tileY}`);
    }

    const corridorMinX = baseTileX - 1;
    const corridorMaxX = baseTileX + COMMAND_CENTER_WIDTH_TILES + 1;
    const corridorMinY = baseTileY + COMMAND_CENTER_HEIGHT_TILES;
    const corridorMaxY = corridorMinY + 3;
    for (let tileX = corridorMinX; tileX <= corridorMaxX; tileX += 1) {
        for (let tileY = corridorMinY; tileY <= corridorMaxY; tileY += 1) {
            if (tileX < 0 || tileY < 0 || tileX > mapMaxTile || tileY > mapMaxTile) {
                continue;
            }
            occupied.add(`${tileX}_${tileY}`);
        }
    }

    return occupied;
};

const collectHazardCandidates = (
    context: HazardCandidateCollectionContext,
    paddingTiles: number
): void => {
    const paddedMinX = clampTile(context.minX - paddingTiles);
    const paddedMaxX = clampTile(context.maxX + paddingTiles);
    const paddedMinY = clampTile(context.minY - paddingTiles);
    const paddedMaxY = clampTile(context.maxY + paddingTiles);
    for (let tileX = paddedMinX; tileX <= paddedMaxX; tileX += 1) {
        for (let tileY = paddedMinY; tileY <= paddedMaxY; tileY += 1) {
            const tileKey = `${tileX}_${tileY}`;
            if (context.candidateKeys.has(tileKey)) {
                continue;
            }
            if (context.occupiedTiles.has(tileKey) || context.placedTiles.has(tileKey)) {
                continue;
            }
            if (context.state.blockingTiles.has(`${tileX},${tileY}`)) {
                continue;
            }
            context.candidateKeys.add(tileKey);
            context.candidates.push({ tileX, tileY });
        }
    }
};

const populateHazardCandidates = (
    context: HazardCandidateCollectionContext,
    count: number
): void => {
    collectHazardCandidates(context, 0);
    for (let padding = 2; context.candidates.length < count && padding <= 10; padding += 2) {
        collectHazardCandidates(context, padding);
    }
};

const shouldApplyDefenseAngle = (type: "mine" | "turret" | "plasma" | "sleeper" | "dfg"): boolean => {
    return type === "turret" || type === "plasma" || type === "sleeper";
};

const buildRandomHazardEntry = (
    candidate: HazardCandidate,
    type: "mine" | "turret" | "plasma" | "sleeper" | "dfg",
    baseTileX: number,
    baseTileY: number
): FakeCityDefenseEntry => {
    const offsetX = 0.1 + (Math.random() * 0.8);
    const offsetY = 0.1 + (Math.random() * 0.8);
    const entry: FakeCityDefenseEntry = {
        type,
        dx: (candidate.tileX - baseTileX) + offsetX,
        dy: (candidate.tileY - baseTileY) + offsetY
    };
    if (shouldApplyDefenseAngle(type)) {
        entry.angle = Math.floor(Math.random() * 32);
    }
    return entry;
};

const generateRandomHazards = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    baseTileX: number,
    baseTileY: number,
    layout: FakeCityLayoutEntry[],
    count: number,
    type: "mine" | "turret" | "plasma" | "sleeper" | "dfg",
    extraOccupied: Set<string>
): FakeCityDefenseEntry[] => {
    if (count <= 0) {
        return [];
    }

    const mapMaxTile = mapMaxTileFromConfig(runtimeConfig);
    const bounds = calculateLayoutBounds(layout, baseTileX, baseTileY);
    const minX = Math.max(0, bounds.minTileX - 2);
    const maxX = Math.min(mapMaxTile, bounds.maxTileX + 2);
    const minY = Math.max(0, bounds.minTileY - 2);
    const maxY = Math.min(mapMaxTile, bounds.maxTileY + 2);

    const occupiedTiles = createLayoutOccupiedSet(layout, baseTileX, baseTileY);
    for (const occupied of extraOccupied.values()) {
        occupiedTiles.add(occupied);
    }

    const placedTiles = new Set<string>();
    const candidateKeys = new Set<string>();
    const candidates: HazardCandidate[] = [];
    const candidateContext: HazardCandidateCollectionContext = {
        state,
        minX,
        maxX,
        minY,
        maxY,
        occupiedTiles,
        placedTiles,
        candidateKeys,
        candidates
    };
    populateHazardCandidates(candidateContext, count);
    shuffleInPlace(candidates);

    const hazards: FakeCityDefenseEntry[] = [];
    for (const candidate of candidates) {
        if (hazards.length >= count) {
            break;
        }
        hazards.push(buildRandomHazardEntry(candidate, type, baseTileX, baseTileY));
        placedTiles.add(`${candidate.tileX}_${candidate.tileY}`);
    }

    return hazards;
};

export const buildRandomDefensePlan = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    baseTileX: number,
    baseTileY: number,
    layout: FakeCityLayoutEntry[]
): FakeCityDefenseEntry[] => {
    const ccDefenses = generateCommandCenterDefenses();
    const mapMaxTile = mapMaxTileFromConfig(runtimeConfig);
    const ccOccupied = buildCcOccupiedTiles(baseTileX, baseTileY, ccDefenses, mapMaxTile);
    const randomMines = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 8, "mine", ccOccupied);
    const randomTurrets = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 4, "turret", ccOccupied);
    const randomPlasma = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 3, "plasma", ccOccupied);
    const randomSleepers = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 2, "sleeper", ccOccupied);
    const randomDfg = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 2, "dfg", ccOccupied);
    return [...ccDefenses, ...randomMines, ...randomTurrets, ...randomPlasma, ...randomSleepers, ...randomDfg];
};
