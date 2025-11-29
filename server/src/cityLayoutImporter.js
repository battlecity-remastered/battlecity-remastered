"use strict";

const { ITEM_TYPES, normalizeItemType } = require('./items');
const { TILE_SIZE } = require('./gameplay/constants');
const citySpawns = require('../../shared/citySpawns.json');

const MAP_SIZE = 512;
const BUILDING_SIZE_TILES = 3;

const HAZARD_TYPES = new Set([
    ITEM_TYPES.BOMB,
    ITEM_TYPES.MINE,
    ITEM_TYPES.DFG,
]);

const DEFENSE_TYPES = new Set([
    ITEM_TYPES.WALL,
    ITEM_TYPES.TURRET,
    ITEM_TYPES.SLEEPER,
    ITEM_TYPES.PLASMA,
]);

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const normaliseCityId = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const clampTile = (tile) => {
    if (!Number.isFinite(tile)) {
        return null;
    }
    const bounded = Math.max(0, Math.min(MAP_SIZE - 1, Math.floor(tile)));
    return bounded;
};

const resolveBaseForCity = (game, cityId, payload = null) => {
    const cityState = game?.cities?.[cityId];
    const baseTileX = toFiniteNumber(cityState?.tileX ?? payload?.baseTileX, null);
    const baseTileY = toFiniteNumber(cityState?.tileY ?? payload?.baseTileY, null);
    if (Number.isFinite(baseTileX) && Number.isFinite(baseTileY)) {
        return { tileX: baseTileX, tileY: baseTileY };
    }
    const spawn = citySpawns?.[cityId];
    if (spawn && Number.isFinite(spawn.tileX) && Number.isFinite(spawn.tileY)) {
        return { tileX: spawn.tileX, tileY: spawn.tileY };
    }
    return null;
};

const normaliseLayoutEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const type = normalizeItemType(entry.type ?? entry.buildingType, null);
    const dx = toFiniteNumber(entry.dx ?? entry.offsetX, null);
    const dy = toFiniteNumber(entry.dy ?? entry.offsetY, null);
    if (!Number.isFinite(type) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    return { type, dx, dy };
};

const normaliseInstallationEntry = (entry) => {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    const type = normalizeItemType(entry.type ?? entry.hazardKey ?? entry.exportType, null);
    const dx = toFiniteNumber(entry.dx ?? entry.offsetX, null);
    const dy = toFiniteNumber(entry.dy ?? entry.offsetY, null);
    if (!Number.isFinite(type) || !Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const angle = toFiniteNumber(entry.angle ?? entry.rotation, null);
    return { type, dx, dy, angle };
};

const rectanglesCollide = (a, b) => {
    if (!a || !b) {
        return false;
    }
    return !(
        a.x + a.w <= b.x ||
        b.x + b.w <= a.x ||
        a.y + a.h <= b.y ||
        b.y + b.h <= a.y
    );
};

const pushBuildingTiles = (set, tileX, tileY) => {
    if (!set) {
        return;
    }
    for (let dx = 0; dx < BUILDING_SIZE_TILES; dx += 1) {
        for (let dy = 0; dy < BUILDING_SIZE_TILES; dy += 1) {
            set.add(`${tileX + dx}_${tileY + dy}`);
        }
    }
};

class CityLayoutImporter {

    constructor({ game, buildingFactory, hazardManager, defenseManager }) {
        this.game = game;
        this.buildingFactory = buildingFactory;
        this.hazardManager = hazardManager;
        this.defenseManager = defenseManager;
    }

    handleImport(socket, rawPayload, respond = null) {
        const ack = (payload) => {
            if (typeof respond === 'function') {
                respond(payload);
            }
        };

        if (!socket || !socket.id) {
            ack({ error: 'Unable to determine requesting player.' });
            return;
        }

        const player = this.game?.players?.[socket.id];
        if (!player) {
            ack({ error: 'Join a city before importing a layout.' });
            return;
        }
        if (!player.isMayor) {
            ack({ error: 'Only mayors can import layouts for their city.' });
            return;
        }
        const cityId = normaliseCityId(player.city, null);
        if (cityId === null) {
            ack({ error: 'Join a city before importing a layout.' });
            return;
        }

        let payloadText = rawPayload;
        if (typeof rawPayload === 'string') {
            payloadText = rawPayload.trim();
        }

        let parsedPayload = rawPayload;
        if (typeof payloadText === 'string') {
            try {
                parsedPayload = JSON.parse(payloadText);
            } catch (_error) {
                ack({ error: 'Invalid JSON. Please paste the layout exactly as exported.' });
                return;
            }
        }

        if (!parsedPayload || typeof parsedPayload !== 'object') {
            ack({ error: 'Layout payload is missing or malformed.' });
            return;
        }

        try {
            const result = this.importLayout(cityId, parsedPayload, { ownerId: socket.id });
            ack(result);
        } catch (error) {
            ack({ error: error?.message || 'Failed to import layout.' });
        }
    }

    importLayout(cityId, payload, options = {}) {
        if (!this.buildingFactory) {
            throw new Error('Building factory is unavailable.');
        }
        const base = resolveBaseForCity(this.game, cityId, payload);
        if (!base) {
            throw new Error('Unable to determine city base coordinates.');
        }

        const rawLayoutEntries = Array.isArray(payload?.layout)
            ? payload.layout
            : (Array.isArray(payload?.buildings) ? payload.buildings : []);
        const rawInstallationEntries = Array.isArray(payload?.defenses)
            ? payload.defenses
            : (Array.isArray(payload?.hazards) ? payload.hazards : []);

        const layoutEntries = rawLayoutEntries
            .map((entry) => normaliseLayoutEntry(entry))
            .filter(Boolean);
        const installationEntries = rawInstallationEntries
            .map((entry) => normaliseInstallationEntry(entry))
            .filter(Boolean);

        if (!layoutEntries.length && !installationEntries.length) {
            throw new Error('Layout payload did not include any buildings or defenses.');
        }

        this.validateLayout(cityId, base, layoutEntries, installationEntries);

        const removedBuildings = this.clearCityBuildings(cityId);
        const removedHazards = this.hazardManager?.removeHazardsForTeam(cityId, 'layout_import') || 0;
        const existingDefenses = this.defenseManager?.getCityDefenses(cityId) || [];
        if (this.defenseManager) {
            this.defenseManager.clearCity(cityId, { broadcast: false });
        }
        const removedDefenses = existingDefenses.length;

        let placedBuildings = 0;
        let skippedBuildings = 0;
        layoutEntries.forEach((entry) => {
            const tileX = clampTile(base.tileX + entry.dx);
            const tileY = clampTile(base.tileY + entry.dy);
            const buildingData = { x: tileX, y: tileY, type: entry.type, city: cityId };
            const building = this.buildingFactory.spawnStaticBuilding({
                ...buildingData,
                ownerId: options.ownerId || null
            });
            if (building) {
                placedBuildings += 1;
            } else {
                skippedBuildings += 1;
            }
        });

        let placedHazards = 0;
        let skippedHazards = 0;
        const defenseRecords = [];
        installationEntries.forEach((entry) => {
            const tileX = clampTile(base.tileX + entry.dx);
            const tileY = clampTile(base.tileY + entry.dy);
            const itemType = normalizeItemType(entry.type, null);
            if (HAZARD_TYPES.has(itemType)) {
                if (!this.hazardManager) {
                    skippedHazards += 1;
                    return;
                }
                const hazard = this.hazardManager.spawnSystemHazard({
                    type: itemType,
                    x: tileX * TILE_SIZE,
                    y: tileY * TILE_SIZE,
                    ownerId: options.ownerId || null,
                    teamId: cityId
                });
                if (hazard) {
                    placedHazards += 1;
                } else {
                    skippedHazards += 1;
                }
                return;
            }
            if (DEFENSE_TYPES.has(itemType)) {
                defenseRecords.push({
                    type: itemType,
                    x: tileX * TILE_SIZE,
                    y: tileY * TILE_SIZE,
                    cityId,
                    teamId: cityId,
                    ownerId: options.ownerId || null,
                    angle: entry.angle ?? null,
                    source: 'system'
                });
                return;
            }
            skippedHazards += 1;
        });

        let placedDefenses = 0;
        if (this.defenseManager && defenseRecords.length) {
            const sanitized = this.defenseManager.replaceSystemDefenses(cityId, defenseRecords, {
                ownerId: options.ownerId || null
            }) || [];
            placedDefenses = sanitized.length;
        } else if (this.defenseManager) {
            this.defenseManager.broadcastCity(cityId);
        }

        if (typeof this.buildingFactory.recomputeCityCanBuild === 'function') {
            this.buildingFactory.recomputeCityCanBuild(cityId);
        }

        return {
            ok: true,
            cityId,
            base,
            removedBuildings,
            removedHazards,
            removedDefenses,
            placedBuildings,
            placedHazards,
            placedDefenses,
            skippedBuildings,
            skippedHazards,
            skippedDefenses: defenseRecords.length - placedDefenses,
        };
    }

    clearCityBuildings(cityId) {
        if (!this.buildingFactory || !this.buildingFactory.buildings) {
            return 0;
        }
        let removed = 0;
        for (const building of Array.from(this.buildingFactory.buildings.values())) {
            const buildingCity = normaliseCityId(building.cityId ?? building.city, null);
            if (buildingCity !== cityId) {
                continue;
            }
            this.buildingFactory.removeBuilding(building.id, true);
            removed += 1;
        }
        return removed;
    }

    validateLayout(cityId, base, layoutEntries, installationEntries) {
        if (!base || !Number.isFinite(base.tileX) || !Number.isFinite(base.tileY)) {
            throw new Error('City base coordinates are missing.');
        }
        const buildingRects = [];
        const blockingBuildingTiles = new Set();

        // Existing buildings from other cities should not be overlapped
        for (const existing of this.buildingFactory?.buildings?.values() || []) {
            const existingCity = normaliseCityId(existing.cityId ?? existing.city, null);
            if (existingCity === cityId) {
                continue;
            }
            buildingRects.push({
                x: existing.x,
                y: existing.y,
                w: BUILDING_SIZE_TILES,
                h: BUILDING_SIZE_TILES
            });
            pushBuildingTiles(blockingBuildingTiles, existing.x, existing.y);
        }

        layoutEntries.forEach((entry, index) => {
            const tileX = base.tileX + entry.dx;
            const tileY = base.tileY + entry.dy;
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
                throw new Error(`Layout entry ${index + 1} has invalid coordinates.`);
            }
            if (tileX < 0 || tileY < 0 ||
                tileX + BUILDING_SIZE_TILES > MAP_SIZE ||
                tileY + BUILDING_SIZE_TILES > MAP_SIZE) {
                throw new Error(`Layout extends beyond the playable map near ${tileX},${tileY}.`);
            }
            const rect = { x: tileX, y: tileY, w: BUILDING_SIZE_TILES, h: BUILDING_SIZE_TILES };
            for (const placed of buildingRects) {
                if (rectanglesCollide(rect, placed)) {
                    throw new Error(`Layout overlaps an existing city at ${tileX},${tileY}.`);
                }
            }
            buildingRects.push(rect);
        });

        const installationTiles = new Set();
        installationEntries.forEach((entry, index) => {
            const tileX = base.tileX + entry.dx;
            const tileY = base.tileY + entry.dy;
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
                throw new Error(`Installation entry ${index + 1} has invalid coordinates.`);
            }
            if (tileX < 0 || tileY < 0 || tileX >= MAP_SIZE || tileY >= MAP_SIZE) {
                throw new Error(`Installation is out of bounds near ${tileX},${tileY}.`);
            }
            const tileKey = `${tileX}_${tileY}`;
            if (installationTiles.has(tileKey)) {
                throw new Error(`Multiple installations share the same tile at ${tileX},${tileY}.`);
            }
            if (blockingBuildingTiles.has(tileKey)) {
                throw new Error(`Installation overlaps a building footprint at ${tileX},${tileY}.`);
            }
            installationTiles.add(tileKey);
        });
    }
}

module.exports = CityLayoutImporter;
