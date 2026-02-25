import fakeCityConfigJson from "../../../data/fakeCities.json" with { type: "json" };
import citySpawnsJson from "../../../data/citySpawns.json" with { type: "json" };
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBuilding, RuntimeConfig, RuntimeDefense, RuntimeFakeCityState, RuntimeHazard, RuntimeState } from "../../runtime/types.js";
import { registerBuildingPopulation, unregisterBuildingPopulation } from "../population/PopulationService.js";
import { buildCityFinancePayload, getOrCreateCity } from "../economy/CityEconomyService.js";
import { loadCityLayoutsFromDirectory, type RelativeLayoutEntry } from "../map/CityLayoutService.js";

type FakeCityLayoutEntry = {
    type?: number;
    dx?: number;
    dy?: number;
    itemsLeft?: number;
};

type FakeCityDefenseEntry = {
    id?: string;
    type?: number | string;
    dx?: number;
    dy?: number;
    angle?: number;
    allowOverlap?: boolean;
};

type FakeCityConfigEntry = {
    cityId?: number;
    baseTileX?: number;
    baseTileY?: number;
    layout?: FakeCityLayoutEntry[];
    defenses?: FakeCityDefenseEntry[];
};

type FakeCityConfig = {
    minPlayers?: number;
    maxActive?: number;
    evaluationIntervalMs?: number;
    layout?: FakeCityLayoutEntry[];
    defaultDefenses?: FakeCityDefenseEntry[];
    cities?: FakeCityConfigEntry[];
};

type CitySpawn = {
    name?: string;
    tileX?: number;
    tileY?: number;
};

const config = fakeCityConfigJson as FakeCityConfig;
const CITY_SPAWNS = citySpawnsJson as Record<string, CitySpawn>;
const CURATED_CITY_LAYOUTS = loadCityLayoutsFromDirectory();
const CURATED_LAYOUTS_BY_CITY = (() => {
    const grouped = new Map<string, RelativeLayoutEntry[][]>();
    for (const [key, layout] of CURATED_CITY_LAYOUTS.entries()) {
        if (!Array.isArray(layout) || layout.length === 0) {
            continue;
        }
        const separatorIndex = key.indexOf("/");
        const cityFolder = separatorIndex >= 0 ? key.slice(0, separatorIndex) : key;
        const normalized = cityFolder.trim().toLowerCase();
        if (normalized.length === 0) {
            continue;
        }
        const bucket = grouped.get(normalized) ?? [];
        bucket.push(layout);
        grouped.set(normalized, bucket);
    }
    return grouped;
})();

const MAP_TILES = 512;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const MIN_ORBABLE_CITIES = 3;
const LOW_PLAYER_THRESHOLD = 20;
const EVAL_INTERVAL_MS = 10_000;
const FAKE_OWNER_PREFIX = "fake_city_";
const ITEM_TYPE_MINE = 4;
const ITEM_TYPE_DFG = 7;

const DEFENSE_TYPE_BY_KEY: Readonly<Record<string, number>> = {
    wall: 8,
    turret: 9,
    turrets: 9,
    sleeper: 10,
    sleepers: 10,
    plasma: 11,
    "plasma cannon": 11,
    plasma_cannon: 11
};

const DEFENSE_MAX_HEALTH: Readonly<Record<number, number>> = {
    8: 40,
    9: 32,
    10: 16,
    11: 40
};

const asFiniteNumber = (value: unknown, fallback: number): number => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const toFiniteCityId = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return Math.max(0, Math.floor(value));
};

const clampTile = (value: number): number => {
    return Math.max(0, Math.min(MAP_TILES - 1, Math.floor(value)));
};

const mapMaxTileFromConfig = (runtimeConfig: RuntimeConfig): number => {
    const mapSize = Math.max(1, Math.floor(runtimeConfig.mapMax / runtimeConfig.tileSize));
    return mapSize - 1;
};

const resolveBlueprintSize = (type: number | null): { width: number; height: number } => {
    if (type === 0) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    return { width: 3, height: 3 };
};

const pickCuratedLayoutForCity = (cityName: string | undefined): FakeCityLayoutEntry[] | null => {
    if (typeof cityName !== "string" || cityName.trim().length === 0) {
        return null;
    }
    const options = CURATED_LAYOUTS_BY_CITY.get(cityName.trim().toLowerCase());
    if (!options || options.length === 0) {
        return null;
    }
    const selected = options[Math.floor(Math.random() * options.length)];
    if (!selected || selected.length === 0) {
        return null;
    }
    return selected.map((entry) => ({
        type: entry.type,
        dx: entry.dx,
        dy: entry.dy
    }));
};

const ensureBaseCommandCenter = (layout: FakeCityLayoutEntry[]): FakeCityLayoutEntry[] => {
    if (!Array.isArray(layout) || layout.length === 0) {
        return layout;
    }
    if (layout.some((entry) => asFiniteNumber(entry.type, Number.NaN) === 0)) {
        return layout;
    }
    return [
        {
            type: 0,
            dx: 0,
            dy: 0
        },
        ...layout
    ];
};

const getConfiguredCities = (): FakeCityConfigEntry[] => {
    const entries = Array.isArray(config.cities) ? config.cities : [];
    return entries.filter((entry) => toFiniteCityId(entry.cityId) !== null);
};

const getConfiguredCitiesForState = (state: RuntimeState): FakeCityConfigEntry[] => {
    const configured = getConfiguredCities();
    if (state.fakeCities.size === 0) {
        return configured;
    }
    const allowed = new Set(state.fakeCities.keys());
    return configured.filter((entry) => {
        const cityId = toFiniteCityId(entry.cityId);
        return cityId !== null && allowed.has(cityId);
    });
};

const ensureFakeCityState = (state: RuntimeState, cityId: number): RuntimeFakeCityState => {
    const existing = state.fakeCities.get(cityId);
    if (existing) {
        return existing;
    }
    const seeded: RuntimeFakeCityState = {
        cityId,
        active: false,
        cooldownUntil: 0,
        buildingIds: [],
        defenseIds: [],
        hazardIds: []
    };
    state.fakeCities.set(cityId, seeded);
    return seeded;
};

const removeCityBots = (state: RuntimeState, cityId: number): void => {
    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.homeCityId !== cityId) {
            continue;
        }
        state.botControllers.delete(botId);
        state.players.delete(botId);
    }
};

const countHumanPlayers = (state: RuntimeState): number => {
    const byPlayerState = Array.from(state.players.values()).filter((player) => !player.isBot).length;
    const byLobby = state.socketCities.size;
    return Math.max(byPlayerState, byLobby);
};

const hasCommandCenter = (state: RuntimeState, cityId: number): boolean => {
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId && building.type === 0) {
            return true;
        }
    }
    return false;
};

const activeOrbableFakeCityCount = (state: RuntimeState): number => {
    let total = 0;
    for (const fakeCity of state.fakeCities.values()) {
        if (!fakeCity.active) {
            continue;
        }
        if (hasCommandCenter(state, fakeCity.cityId)) {
            total += 1;
        }
    }
    return total;
};

const clearCityStructures = (
    state: RuntimeState,
    cityId: number,
    emitter: RuntimeEmitter,
    options: { reason: "cleared" | "city_orbed"; removeBots?: boolean }
): void => {
    const buildingsToRemove = Array.from(state.buildings.values()).filter((building) => building.cityId === cityId);
    for (const building of buildingsToRemove) {
        state.buildings.delete(building.id);
        const updates = unregisterBuildingPopulation(state, building);
        emitter.emit("building.demolished", {
            id: building.id,
            cityId
        });
        for (const update of updates) {
            emitter.emit("population.update", update);
        }
    }

    const hazardsToRemove = Array.from(state.hazards.values()).filter((hazard) => hazard.cityId === cityId);
    for (const hazard of hazardsToRemove) {
        state.hazards.delete(hazard.id);
        emitter.emit("hazard.remove", {
            id: hazard.id,
            reason: options.reason
        });
    }

    const defensesToRemove = Array.from(state.defenses.values()).filter((defense) => defense.cityId === cityId);
    for (const defense of defensesToRemove) {
        state.defenses.delete(defense.id);
        emitter.emit("defense.remove", {
            id: defense.id,
            reason: options.reason
        });
    }

    if (options.removeBots !== false) {
        removeCityBots(state, cityId);
    }
};

const calculateLayoutBounds = (
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

const createLayoutOccupiedSet = (
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
    const candidates: Array<{ tileX: number; tileY: number }> = [];
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

const resolveDefenseItemType = (type: number | string | undefined): number | null => {
    if (type === undefined || type === null) {
        return null;
    }
    if (typeof type === "number" && Number.isFinite(type)) {
        return type;
    }
    const normalized = String(type).toLowerCase();
    return DEFENSE_TYPE_BY_KEY[normalized] ?? null;
};

type ResolvedDefensePlacement = {
    column: number;
    row: number;
    tileKey: string;
    worldX: number;
    worldY: number;
    normalizedType: number | string;
    orientation: number;
};

type DefenseDeploymentContext = {
    state: RuntimeState;
    runtimeConfig: RuntimeConfig;
    emitter: RuntimeEmitter;
    cityId: number;
    ownerId: string;
    baseTileX: number;
    baseTileY: number;
    mapMaxTile: number;
    layoutOccupied: Set<string>;
    placedTiles: Set<string>;
    defenseIds: string[];
    hazardIds: string[];
};

const HAZARD_DEFENSE_TYPES = new Set(["mine", "mines", "minefield", "dfg"]);

const resolveDefensePlacement = (
    defense: FakeCityDefenseEntry,
    context: DefenseDeploymentContext
): ResolvedDefensePlacement | null => {
    if (defense.type === undefined || defense.type === null) {
        return null;
    }
    const dx = asFiniteNumber(defense.dx, Number.NaN);
    const dy = asFiniteNumber(defense.dy, Number.NaN);
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const tileX = context.baseTileX + dx;
    const tileY = context.baseTileY + dy;
    if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return null;
    }
    if (tileX < 0 || tileY < 0 || tileX > context.mapMaxTile || tileY > context.mapMaxTile) {
        return null;
    }

    const column = Math.floor(tileX);
    const row = Math.floor(tileY);
    const normalizedType = typeof defense.type === "string" ? defense.type.toLowerCase() : defense.type;
    const orientation = Math.max(0, Math.min(31, Math.floor(asFiniteNumber(defense.angle, 0)) % 32));
    return {
        column,
        row,
        tileKey: `${column}_${row}`,
        worldX: tileX * context.runtimeConfig.tileSize,
        worldY: tileY * context.runtimeConfig.tileSize,
        normalizedType,
        orientation
    };
};

const canPlaceDefenseAtTile = (
    defense: FakeCityDefenseEntry,
    tileKey: string,
    layoutOccupied: Set<string>,
    placedTiles: Set<string>
): boolean => {
    if (defense.allowOverlap === true) {
        return true;
    }
    return !layoutOccupied.has(tileKey) && !placedTiles.has(tileKey);
};

const isHazardDefenseType = (normalizedType: number | string): normalizedType is string => {
    return typeof normalizedType === "string" && HAZARD_DEFENSE_TYPES.has(normalizedType);
};

const spawnFakeCityHazard = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry,
    placement: ResolvedDefensePlacement
): void => {
    const normalizedType = placement.normalizedType;
    if (!isHazardDefenseType(normalizedType)) {
        return;
    }
    context.state.seq += 1;
    const hazard: RuntimeHazard = {
        id: defense.id ?? `fake_hazard_${context.cityId}_${context.state.seq}`,
        ownerId: context.ownerId,
        cityId: context.cityId,
        type: normalizedType === "dfg" ? ITEM_TYPE_DFG : ITEM_TYPE_MINE,
        x: placement.worldX,
        y: placement.worldY,
        radius: context.runtimeConfig.tileSize,
        damage: normalizedType === "dfg" ? context.runtimeConfig.hazardDefaultDamage : 19,
        remainingMs: Number.POSITIVE_INFINITY,
        armed: true,
        active: true
    };
    context.state.hazards.set(hazard.id, hazard);
    context.hazardIds.push(hazard.id);
    context.placedTiles.add(placement.tileKey);
    context.emitter.emit("hazard.spawn", {
        id: hazard.id,
        cityId: context.cityId,
        type: hazard.type,
        position: { x: hazard.x, y: hazard.y },
        radius: hazard.radius,
        armed: true,
        active: true
    });
};

const spawnFakeCityDefense = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry,
    placement: ResolvedDefensePlacement,
    itemType: number
): void => {
    context.state.seq += 1;
    const maxHealth = DEFENSE_MAX_HEALTH[itemType] ?? 20;
    const runtimeDefense: RuntimeDefense = {
        id: defense.id ?? `fake_defense_${context.cityId}_${context.state.seq}`,
        cityId: context.cityId,
        type: itemType,
        tileX: placement.column,
        tileY: placement.row,
        health: maxHealth,
        maxHealth,
        orientation: placement.orientation,
        nextShotAt: 0
    };
    context.state.defenses.set(runtimeDefense.id, runtimeDefense);
    context.defenseIds.push(runtimeDefense.id);
    context.placedTiles.add(placement.tileKey);
    const basePayload = {
        id: runtimeDefense.id,
        cityId: context.cityId,
        type: runtimeDefense.type,
        tileX: runtimeDefense.tileX,
        tileY: runtimeDefense.tileY,
        health: runtimeDefense.health,
        maxHealth: runtimeDefense.maxHealth
    };
    const payload: KnownEventPayloadByType["defense.spawn"] =
        typeof runtimeDefense.orientation === "number" && Number.isFinite(runtimeDefense.orientation)
            ? { ...basePayload, orientation: runtimeDefense.orientation }
            : basePayload;
    context.emitter.emit("defense.spawn", payload);
};

const deploySingleDefense = (
    context: DefenseDeploymentContext,
    defense: FakeCityDefenseEntry
): void => {
    const placement = resolveDefensePlacement(defense, context);
    if (!placement) {
        return;
    }
    if (!canPlaceDefenseAtTile(defense, placement.tileKey, context.layoutOccupied, context.placedTiles)) {
        return;
    }
    if (isHazardDefenseType(placement.normalizedType)) {
        spawnFakeCityHazard(context, defense, placement);
        return;
    }
    const itemType = resolveDefenseItemType(placement.normalizedType);
    if (itemType === null) {
        return;
    }
    spawnFakeCityDefense(context, defense, placement, itemType);
};

const deployDefenses = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    cityId: number,
    baseTileX: number,
    baseTileY: number,
    layout: FakeCityLayoutEntry[],
    ownerId: string,
    defenses: FakeCityDefenseEntry[]
): { defenseIds: string[]; hazardIds: string[] } => {
    const defenseIds: string[] = [];
    const hazardIds: string[] = [];
    if (!defenses.length) {
        return { defenseIds, hazardIds };
    }

    const context: DefenseDeploymentContext = {
        state,
        runtimeConfig,
        emitter,
        cityId,
        ownerId,
        baseTileX,
        baseTileY,
        mapMaxTile: mapMaxTileFromConfig(runtimeConfig),
        layoutOccupied: createLayoutOccupiedSet(layout, baseTileX, baseTileY),
        placedTiles: new Set<string>(),
        defenseIds,
        hazardIds
    };

    for (const defense of defenses) {
        deploySingleDefense(context, defense);
    }

    return { defenseIds, hazardIds };
};

const spawnFakeCity = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    entry: FakeCityConfigEntry,
    now: number
): boolean => {
    const cityId = toFiniteCityId(entry.cityId);
    if (cityId === null) {
        return false;
    }

    const existingState = ensureFakeCityState(state, cityId);
    if (existingState.active) {
        return false;
    }
    if (now < existingState.cooldownUntil) {
        return false;
    }

    const spawn = CITY_SPAWNS[String(cityId)];
    const baseTileX = Math.floor(asFiniteNumber(entry.baseTileX, asFiniteNumber(spawn?.tileX, 0)));
    const baseTileY = Math.floor(asFiniteNumber(entry.baseTileY, asFiniteNumber(spawn?.tileY, 0)));

    const curatedLayout = pickCuratedLayoutForCity(spawn?.name);
    const layout = ensureBaseCommandCenter((Array.isArray(curatedLayout) && curatedLayout.length > 0)
        ? curatedLayout
        : ((Array.isArray(entry.layout) && entry.layout.length > 0)
            ? entry.layout
            : (Array.isArray(config.layout) ? config.layout : [])));
    if (!layout.length) {
        return false;
    }

    clearCityStructures(state, cityId, emitter, {
        reason: "cleared",
        removeBots: false
    });

    const ownerId = `${FAKE_OWNER_PREFIX}${cityId}`;
    const buildingIds: string[] = [];
    for (const blueprint of layout) {
        const type = asFiniteNumber(blueprint.type, Number.NaN);
        if (!Number.isFinite(type)) {
            continue;
        }
        const dx = asFiniteNumber(blueprint.dx, 0);
        const dy = asFiniteNumber(blueprint.dy, 0);
        const tileX = Math.floor(baseTileX + dx);
        const tileY = Math.floor(baseTileY + dy);
        state.seq += 1;
        const building: RuntimeBuilding = {
            id: `fake_building_${cityId}_${state.seq}`,
            ownerId,
            cityId,
            type,
            tileX,
            tileY,
            health: runtimeConfig.defaultBuildingHealth,
            maxHealth: runtimeConfig.defaultBuildingHealth,
            population: 0
        };
        state.buildings.set(building.id, building);
        buildingIds.push(building.id);
        emitter.emit("building.placed", {
            id: building.id,
            ownerId: building.ownerId,
            cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            health: building.health,
            maxHealth: building.maxHealth
        });
        const populationEvents = registerBuildingPopulation(state, building);
        for (const update of populationEvents) {
            emitter.emit("population.update", update);
        }
    }

    if (!buildingIds.length) {
        return false;
    }

    const ccDefenses = generateCommandCenterDefenses();
    const mapMaxTile = mapMaxTileFromConfig(runtimeConfig);
    const ccOccupied = buildCcOccupiedTiles(baseTileX, baseTileY, ccDefenses, mapMaxTile);
    const randomMines = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 8, "mine", ccOccupied);
    const randomTurrets = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 4, "turret", ccOccupied);
    const randomPlasma = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 3, "plasma", ccOccupied);
    const randomSleepers = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 2, "sleeper", ccOccupied);
    const randomDfg = generateRandomHazards(state, runtimeConfig, baseTileX, baseTileY, layout, 2, "dfg", ccOccupied);

    const allDefenses = [
        ...ccDefenses,
        ...randomMines,
        ...randomTurrets,
        ...randomPlasma,
        ...randomSleepers,
        ...randomDfg
    ];

    const defenseResult = deployDefenses(
        state,
        runtimeConfig,
        emitter,
        cityId,
        baseTileX,
        baseTileY,
        layout,
        ownerId,
        allDefenses
    );

    getOrCreateCity(state, cityId, runtimeConfig);
    state.fakeCities.set(cityId, {
        cityId,
        active: true,
        cooldownUntil: existingState.cooldownUntil,
        buildingIds,
        defenseIds: defenseResult.defenseIds,
        hazardIds: defenseResult.hazardIds,
        baseTileX,
        baseTileY
    });
    emitter.emit("city.finance", buildCityFinancePayload(state, cityId, runtimeConfig));

    return true;
};

const despawnFakeCity = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    cityId: number,
    runtimeConfig: RuntimeConfig
): boolean => {
    const existing = state.fakeCities.get(cityId);
    if (!existing || !existing.active) {
        return false;
    }

    clearCityStructures(state, cityId, emitter, {
        reason: "cleared"
    });

    state.fakeCities.set(cityId, {
        ...existing,
        active: false,
        buildingIds: [],
        defenseIds: [],
        hazardIds: []
    });
    emitter.emit("city.finance", buildCityFinancePayload(state, cityId, runtimeConfig));

    return true;
};

const spawnFakeCities = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    count: number,
    configured: FakeCityConfigEntry[]
): number[] => {
    const createdIds: number[] = [];
    if (count <= 0) {
        return createdIds;
    }

    const available = configured.filter((entry) => {
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null) {
            return false;
        }
        const fakeCity = state.fakeCities.get(cityId);
        if (!fakeCity) {
            return false;
        }
        if (fakeCity.active) {
            return false;
        }
        return now >= fakeCity.cooldownUntil;
    });

    for (const entry of available) {
        if (createdIds.length >= count) {
            break;
        }
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null) {
            continue;
        }
        if (spawnFakeCity(state, runtimeConfig, emitter, entry, now)) {
            createdIds.push(cityId);
        }
    }

    return createdIds;
};

const removeFakeCities = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    count: number
): number => {
    if (count <= 0) {
        return 0;
    }
    let removed = 0;
    const activeIds = Array.from(state.fakeCities.values())
        .filter((fakeCity) => fakeCity.active)
        .map((fakeCity) => fakeCity.cityId)
        .sort((a, b) => b - a);

    for (const cityId of activeIds) {
        if (removed >= count) {
            break;
        }
        if (despawnFakeCity(state, emitter, cityId, runtimeConfig)) {
            removed += 1;
        }
    }

    return removed;
};

const nearestConfiguredCity = (
    configured: FakeCityConfigEntry[],
    playerCityId: number,
    state: RuntimeState,
    now: number
): FakeCityConfigEntry | null => {
    const playerSpawn = CITY_SPAWNS[String(playerCityId)];
    if (!playerSpawn || !Number.isFinite(playerSpawn.tileX) || !Number.isFinite(playerSpawn.tileY)) {
        return null;
    }

    let nearest: FakeCityConfigEntry | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const entry of configured) {
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null || cityId === playerCityId) {
            continue;
        }
        const fakeCity = state.fakeCities.get(cityId);
        if (!fakeCity) {
            continue;
        }
        if (fakeCity.active || now < fakeCity.cooldownUntil) {
            continue;
        }

        const spawn = CITY_SPAWNS[String(cityId)];
        if (!spawn || !Number.isFinite(spawn.tileX) || !Number.isFinite(spawn.tileY)) {
            continue;
        }
        const dx = asFiniteNumber(spawn.tileX, 0) - asFiniteNumber(playerSpawn.tileX, 0);
        const dy = asFiniteNumber(spawn.tileY, 0) - asFiniteNumber(playerSpawn.tileY, 0);
        const distance = Math.sqrt((dx * dx) + (dy * dy));
        if (distance <= 0 || distance >= bestDistance) {
            continue;
        }
        bestDistance = distance;
        nearest = entry;
    }

    return nearest;
};

const resolveSoloPlayerCity = (state: RuntimeState): number | null => {
    for (const player of state.players.values()) {
        if (!player.isBot && Number.isFinite(player.city)) {
            return player.city;
        }
    }
    for (const cityId of state.socketCities.values()) {
        if (Number.isFinite(cityId)) {
            return cityId;
        }
    }
    return null;
};

export const loadConfiguredFakeCityIds = (): number[] => {
    const ids: number[] = [];
    for (const entry of getConfiguredCities()) {
        const cityId = toFiniteCityId(entry.cityId);
        if (cityId === null || ids.includes(cityId)) {
            continue;
        }
        ids.push(cityId);
    }
    return ids;
};

export const markFakeCityCooldown = (
    state: RuntimeState,
    cityId: number,
    now: number,
    runtimeConfig: RuntimeConfig
): void => {
    const existing = ensureFakeCityState(state, cityId);
    state.fakeCities.set(cityId, {
        ...existing,
        cityId,
        active: false,
        cooldownUntil: now + runtimeConfig.fakeCityCooldownMs,
        buildingIds: [],
        defenseIds: [],
        hazardIds: []
    });
    removeCityBots(state, cityId);
    state.fakeCityEvaluationAt = 0;
};

const countActiveFakeCities = (state: RuntimeState): number => {
    return Array.from(state.fakeCities.values()).filter((city) => city.active).length;
};

const tryActivateSoloCity = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    configured: FakeCityConfigEntry[],
    now: number
): number | null => {
    if (countActiveFakeCities(state) !== 0) {
        return null;
    }
    const soloCity = resolveSoloPlayerCity(state);
    if (soloCity === null) {
        return null;
    }
    const nearby = nearestConfiguredCity(configured, soloCity, state, now);
    if (!nearby || !spawnFakeCity(state, runtimeConfig, emitter, nearby, now)) {
        return null;
    }
    return toFiniteCityId(nearby.cityId);
};

const resolveDesiredActiveFakeCities = (
    state: RuntimeState,
    humanCount: number,
    minPlayers: number,
    maxActive: number
): number => {
    const underThreshold = humanCount < minPlayers;
    let desired = underThreshold ? maxActive : 0;
    const orbableCount = activeOrbableFakeCityCount(state);
    if (orbableCount < MIN_ORBABLE_CITIES) {
        const needed = MIN_ORBABLE_CITIES - orbableCount;
        desired = Math.max(desired, Math.min(needed, maxActive));
    }
    return desired;
};

const appendActivatedCityIds = (target: number[], createdIds: number[]): void => {
    for (const cityId of createdIds) {
        if (target.includes(cityId)) {
            continue;
        }
        target.push(cityId);
    }
};

const resolveCitiesToDeactivate = (
    state: RuntimeState,
    activeCount: number,
    desired: number
): number[] => {
    const toRemove = activeCount - desired;
    return Array.from(state.fakeCities.values())
        .filter((fakeCity) => fakeCity.active)
        .map((fakeCity) => fakeCity.cityId)
        .sort((a, b) => b - a)
        .slice(0, toRemove);
};

const appendRemovedCityIds = (
    deactivated: number[],
    activeIds: number[],
    removed: number
): void => {
    for (let index = 0; index < Math.min(removed, activeIds.length); index += 1) {
        deactivated.push(activeIds[index] as number);
    }
};

export const tickFakeCityLifecycle = (
    state: RuntimeState,
    runtimeConfig: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number
): { activated: number[]; deactivated: number[] } => {
    const activated: number[] = [];
    const deactivated: number[] = [];
    const configured = getConfiguredCitiesForState(state);
    if (!configured.length) {
        return { activated, deactivated };
    }

    if (now < state.fakeCityEvaluationAt) {
        return { activated, deactivated };
    }

    const intervalMs = Math.max(1000, asFiniteNumber(config.evaluationIntervalMs, EVAL_INTERVAL_MS));
    state.fakeCityEvaluationAt = now + intervalMs;

    const humanCount = countHumanPlayers(state);
    const maxActive = Math.min(configured.length, Math.max(0, Math.floor(asFiniteNumber(config.maxActive, configured.length))));
    const minPlayers = Math.max(LOW_PLAYER_THRESHOLD, Math.floor(asFiniteNumber(config.minPlayers, LOW_PLAYER_THRESHOLD)));

    if (humanCount === 1) {
        const soloCityId = tryActivateSoloCity(state, runtimeConfig, emitter, configured, now);
        if (soloCityId !== null) {
            activated.push(soloCityId);
        }
    }

    const activeCount = countActiveFakeCities(state);
    const desired = resolveDesiredActiveFakeCities(state, humanCount, minPlayers, maxActive);

    if (desired > activeCount) {
        const createdIds = spawnFakeCities(state, runtimeConfig, emitter, now, desired - activeCount, configured);
        appendActivatedCityIds(activated, createdIds);
    }
    if (desired < activeCount) {
        const activeIds = resolveCitiesToDeactivate(state, activeCount, desired);
        const removed = removeFakeCities(state, runtimeConfig, emitter, activeCount - desired);
        appendRemovedCityIds(deactivated, activeIds, removed);
    }

    return { activated, deactivated };
};
