import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_DFG,
    ITEM_TYPE_MINE,
    ITEM_TYPE_PLASMA,
    ITEM_TYPE_SLEEPER,
    ITEM_TYPE_TURRET,
    ITEM_TYPE_WALL
} from '../constants.js';
import { getCitySpawn } from './citySpawns.js';

const TILE_SIZE = 48;
const MAP_SIZE = 512;

const toFiniteNumber = (value, fallback = null) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

const normaliseCityId = (candidate) => {
    const numeric = toFiniteNumber(candidate, null);
    return Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : null;
};

const HAZARD_KEY_TO_TYPE = Object.freeze({
    bomb: ITEM_TYPE_BOMB,
    mine: ITEM_TYPE_MINE,
    dfg: ITEM_TYPE_DFG,
    wall: ITEM_TYPE_WALL,
    turret: ITEM_TYPE_TURRET,
    sleeper: ITEM_TYPE_SLEEPER,
    plasma: ITEM_TYPE_PLASMA
});

const normaliseHazardType = (value) => {
    if (value === null || value === undefined) {
        return null;
    }
    const numeric = toFiniteNumber(value, null);
    if (Number.isFinite(numeric)) {
        return numeric;
    }
    const key = `${value}`.trim().toLowerCase();
    return HAZARD_KEY_TO_TYPE[key] ?? null;
};

const normaliseLayoutEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const type = toFiniteNumber(entry.type ?? entry.buildingType, null);
    const dx = toFiniteNumber(entry.dx ?? entry.offsetX, null);
    const dy = toFiniteNumber(entry.dy ?? entry.offsetY, null);
    if (!Number.isFinite(type) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    return { type, dx, dy };
};

const normaliseDefenseEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const type = normaliseHazardType(entry.type ?? entry.hazardKey ?? entry.exportType);
    const dx = toFiniteNumber(entry.dx ?? entry.offsetX, null);
    const dy = toFiniteNumber(entry.dy ?? entry.offsetY, null);
    if (!Number.isFinite(type) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const angle = toFiniteNumber(entry.angle ?? entry.rotation, null);
    return { type, dx, dy, angle };
};

const clearCityBuildings = (game, cityId) => {
    if (!game?.buildingFactory || !Number.isFinite(cityId)) {
        return 0;
    }
    let removed = 0;
    let node = game.buildingFactory.getHead();
    while (node) {
        const next = node.next;
        const buildingCity = toFiniteNumber(node.city ?? node.cityId, null);
        if (buildingCity === cityId) {
            game.buildingFactory.deleteBuilding(node, true, 'import_reset');
            removed += 1;
        }
        node = next;
    }
    return removed;
};

const clearCityInstallations = (game, cityId) => {
    if (!game?.itemFactory || !Number.isFinite(cityId)) {
        return 0;
    }
    let removed = 0;
    let item = game.itemFactory.itemListHead;
    while (item) {
        const next = item.next;
        const teamId = toFiniteNumber(item.teamId ?? item.city, null);
        const isCityOwned = teamId === cityId;
        const isStructure = game.itemFactory.isHazardType(item.type) || item.isDefense;
        if (isCityOwned && isStructure) {
            game.itemFactory.deleteItem(item, { notifyServer: true, reason: 'import_reset' });
            removed += 1;
        }
        item = next;
    }
    return removed;
};

const resolveCityBase = (game, cityId, payload) => {
    const city = game?.cities?.[cityId];
    const baseTileX = toFiniteNumber(city?.tileX ?? payload?.baseTileX, null);
    const baseTileY = toFiniteNumber(city?.tileY ?? payload?.baseTileY, null);
    if (Number.isFinite(baseTileX) && Number.isFinite(baseTileY)) {
        return { tileX: baseTileX, tileY: baseTileY };
    }
    const spawn = getCitySpawn(cityId);
    if (spawn) {
        return { tileX: spawn.tileX, tileY: spawn.tileY };
    }
    return null;
};

const clampTile = (tile) => {
    if (!Number.isFinite(tile)) {
        return null;
    }
    const bounded = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(tile)));
    return bounded;
};

export const importCityLayoutPayload = (game, payload) => {
    if (!game) {
        throw new Error('Game state is unavailable.');
    }
    const cityId = normaliseCityId(game.player?.city);
    if (cityId === null) {
        throw new Error('Join a city before loading a layout.');
    }

    const base = resolveCityBase(game, cityId, payload);
    if (!base) {
        throw new Error('Unable to determine city base coordinates.');
    }

    const layoutEntries = Array.isArray(payload?.layout)
        ? payload.layout
        : (Array.isArray(payload?.buildings) ? payload.buildings : []);
    const defenseEntries = Array.isArray(payload?.defenses)
        ? payload.defenses
        : (Array.isArray(payload?.hazards) ? payload.hazards : []);

    const removedBuildings = clearCityBuildings(game, cityId);
    const removedInstallations = clearCityInstallations(game, cityId);

    let placedBuildings = 0;
    let skippedBuildings = 0;
    layoutEntries.forEach((entry, index) => {
        const normalized = normaliseLayoutEntry(entry);
        if (!normalized) {
            skippedBuildings += 1;
            console.warn('[import] Skipping malformed building entry', { entry, index });
            return;
        }
        const tileX = clampTile(base.tileX + normalized.dx);
        const tileY = clampTile(base.tileY + normalized.dy);
        if (tileX === null || tileY === null) {
            skippedBuildings += 1;
            return;
        }
        const building = game.buildingFactory?.newBuilding(null, tileX, tileY, normalized.type, {
            city: cityId,
            notifyServer: true,
            updateCity: false,
            itemsLeft: 0,
            attachedHouseId: null
        });
        if (building) {
            placedBuildings += 1;
        } else {
            skippedBuildings += 1;
        }
    });

    let placedInstallations = 0;
    let skippedInstallations = 0;
    defenseEntries.forEach((entry, index) => {
        const normalized = normaliseDefenseEntry(entry);
        if (!normalized) {
            skippedInstallations += 1;
            console.warn('[import] Skipping malformed hazard entry', { entry, index });
            return;
        }
        const tileX = clampTile(base.tileX + normalized.dx);
        const tileY = clampTile(base.tileY + normalized.dy);
        if (tileX === null || tileY === null) {
            skippedInstallations += 1;
            return;
        }
        const px = tileX * TILE_SIZE;
        const py = tileY * TILE_SIZE;
        const item = game.itemFactory?.newItem(null, px, py, normalized.type, {
            city: cityId,
            teamId: cityId,
            notifyServer: true,
            snapToPlayer: false,
            angle: normalized.angle
        });
        if (item) {
            placedInstallations += 1;
        } else {
            skippedInstallations += 1;
        }
    });

    if (game.forceDraw !== undefined) {
        game.forceDraw = true;
    }

    return {
        base,
        cityId,
        removedBuildings,
        removedInstallations,
        placedBuildings,
        placedInstallations,
        skippedBuildings,
        skippedInstallations
    };
};

export const importCityLayoutFromJson = (game, jsonText) => {
    if (!jsonText || typeof jsonText !== 'string') {
        throw new Error('Paste exported layout JSON to import a map.');
    }
    let payload = null;
    try {
        payload = JSON.parse(jsonText);
    } catch (_error) {
        throw new Error('Invalid JSON. Please paste the layout exactly as exported.');
    }
    if (!payload || typeof payload !== 'object') {
        throw new Error('Layout payload is missing or malformed.');
    }
    if (payload.cityId !== undefined && payload.cityId !== null) {
        const targetCity = normaliseCityId(payload.cityId);
        const currentCity = normaliseCityId(game?.player?.city);
        if (targetCity !== null && currentCity !== null && targetCity !== currentCity) {
            console.warn('[import] Layout city does not match current player city; continuing with current city.');
        }
    }
    return importCityLayoutPayload(game, payload);
};

export default importCityLayoutFromJson;
