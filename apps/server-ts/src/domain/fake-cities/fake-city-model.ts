import fakeCityConfigJson from "../../../data/fakeCities.json" with { type: "json" };
import citySpawnsJson from "../../../data/citySpawns.json" with { type: "json" };
import { hasCommandCenterBuilding, toFiniteNumber as parseFiniteNumber } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimeFakeCityState, RuntimeState } from "../../runtime/types.js";
import { loadCityLayoutsFromDirectory, type RelativeLayoutEntry } from "../map/CityLayoutService.js";

export type FakeCityLayoutEntry = {
    type?: number;
    dx?: number;
    dy?: number;
    itemsLeft?: number;
};

export type FakeCityDefenseEntry = {
    id?: string;
    type?: number | string;
    dx?: number;
    dy?: number;
    angle?: number;
    allowOverlap?: boolean;
};

export type FakeCityConfigEntry = {
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

export const fakeCityConfig = fakeCityConfigJson as FakeCityConfig;
export const CITY_SPAWNS = citySpawnsJson as Record<string, CitySpawn>;

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

export const MAP_TILES = 512;
export const COMMAND_CENTER_WIDTH_TILES = 3;
export const COMMAND_CENTER_HEIGHT_TILES = 2;
export const MIN_ORBABLE_CITIES = 3;
export const LOW_PLAYER_THRESHOLD = 20;
export const EVAL_INTERVAL_MS = 10_000;
export const FAKE_OWNER_PREFIX = "fake_city_";
export const ITEM_TYPE_MINE = 4;
export const ITEM_TYPE_DFG = 7;

export const DEFENSE_TYPE_BY_KEY: Readonly<Record<string, number>> = {
    wall: 8,
    turret: 9,
    turrets: 9,
    sleeper: 10,
    sleepers: 10,
    plasma: 11,
    "plasma cannon": 11,
    plasma_cannon: 11
};

export const DEFENSE_MAX_HEALTH: Readonly<Record<number, number>> = {
    8: 40,
    9: 32,
    10: 16,
    11: 40
};

export const asFiniteNumber = (value: unknown, fallback: number): number => parseFiniteNumber(value, fallback);

export const toFiniteCityId = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return Math.max(0, Math.floor(value));
};

export const clampTile = (value: number): number => {
    return Math.max(0, Math.min(MAP_TILES - 1, Math.floor(value)));
};

export const mapMaxTileFromConfig = (runtimeConfig: RuntimeConfig): number => {
    const mapSize = Math.max(1, Math.floor(runtimeConfig.mapMax / runtimeConfig.tileSize));
    return mapSize - 1;
};

export const resolveBlueprintSize = (type: number | null): { width: number; height: number } => {
    if (type === 0) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    return { width: 3, height: 3 };
};

export const pickCuratedLayoutForCity = (cityName: string | undefined): FakeCityLayoutEntry[] | null => {
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

export const ensureBaseCommandCenter = (layout: FakeCityLayoutEntry[]): FakeCityLayoutEntry[] => {
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

export const getConfiguredCities = (): FakeCityConfigEntry[] => {
    const entries = Array.isArray(fakeCityConfig.cities) ? fakeCityConfig.cities : [];
    return entries.filter((entry) => toFiniteCityId(entry.cityId) !== null);
};

export const getConfiguredCitiesForState = (state: RuntimeState): FakeCityConfigEntry[] => {
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

export const ensureFakeCityState = (state: RuntimeState, cityId: number): RuntimeFakeCityState => {
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

export const removeCityBots = (state: RuntimeState, cityId: number): void => {
    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.homeCityId !== cityId) {
            continue;
        }
        state.botControllers.delete(botId);
        state.players.delete(botId);
    }
};

export const countHumanPlayers = (state: RuntimeState): number => {
    const byPlayerState = Array.from(state.players.values()).filter((player) => !player.isBot).length;
    const byLobby = state.socketCities.size;
    return Math.max(byPlayerState, byLobby);
};

export const activeOrbableFakeCityCount = (state: RuntimeState): number => {
    let total = 0;
    for (const fakeCity of state.fakeCities.values()) {
        if (!fakeCity.active) {
            continue;
        }
        if (hasCommandCenterBuilding(state.buildings.values(), fakeCity.cityId)) {
            total += 1;
        }
    }
    return total;
};

export const nearestConfiguredCity = (
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
        if (!fakeCity || fakeCity.active || now < fakeCity.cooldownUntil) {
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

export const resolveSoloPlayerCity = (state: RuntimeState): number | null => {
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

export const countActiveFakeCities = (state: RuntimeState): number => {
    return Array.from(state.fakeCities.values()).filter((city) => city.active).length;
};
