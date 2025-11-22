"use strict";

const debug = require('debug')('BattleCity:BuildingFactory');

const Building = require('./Building');
const FactoryBuilding = require('./FactoryBuilding');
const CityManager = require('./CityManager');
const { ITEM_TYPES, normalizeItemType } = require('./items');
const {
    POPULATION_INTERVAL_MS,
    POPULATION_INCREMENT,
    POPULATION_MAX_HOUSE,
    POPULATION_MAX_NON_HOUSE,
    COST_BUILDING,
    isHouse,
    isFactory,
    isResearch,
    isHospital,
    isCommandCenter,
    RESEARCH_DURATION_MS,
    MAX_BUILDING_CHAIN_DISTANCE,
} = require('./constants');
const { rectangleCollision } = require('./gameplay/geometry');
const {
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES,
} = require('./gameplay/constants');

const ITEM_TYPE_ORB = ITEM_TYPES.ORB;
const HAZARD_ITEM_TYPES = new Map([
    [3, 'bomb'],
    [4, 'mine'],
    [7, 'dfg'],
]);
const DEFENSE_ITEM_TYPES = new Set([8, 9, 10, 11]);

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

class BuildingFactory {
    constructor(game) {
        this.game = game;
        this.io = null;
        this.buildings = new Map();
        this.buildingsBySocket = new Map();
        this.cityManager = new CityManager(game);
        this.hazardManager = null;
        this.defenseManager = null;
        this.playerFactory = null;
        this.researchByCity = new Map();
    }

    setManagers({ hazardManager = null, defenseManager = null, playerFactory = null } = {}) {
        if (hazardManager) {
            this.hazardManager = hazardManager;
        }
        if (defenseManager) {
            this.defenseManager = defenseManager;
        }
        if (playerFactory) {
            this.playerFactory = playerFactory;
        }
    }

    serializeBuilding(building) {
        const { FACTORY_ITEM_LIMITS } = require('./constants');
        const limit = FACTORY_ITEM_LIMITS ? FACTORY_ITEM_LIMITS[building.type] : undefined;
        const produced = building.itemsLeft || 0;
        let outstanding = produced;
        if (isFactory(building.type) && typeof this.getCityOutstandingItemCount === 'function') {
            const itemType = building.type % 100;
            const cityId = building.cityId ?? building.city ?? 0;
            outstanding = this.getCityOutstandingItemCount(cityId, itemType);
        }
        const itemsRemaining = limit !== undefined ? Math.max(0, limit - outstanding) : 0;
        return {
            id: building.id,
            ownerId: building.ownerId,
            type: building.type,
            population: building.population,
            attachedHouseId: building.attachedHouseId || null,
            x: building.x,
            y: building.y,
            city: building.cityId ?? 0,
            itemsLeft: produced,
            itemsRemaining,
            itemLimit: limit,
            smokeActive: !!building.smokeActive,
            smokeFrame: building.smokeFrame || 0,
        };
    }

    sendSnapshot(socket) {
        for (const building of this.buildings.values()) {
            const snapshot = this.serializeBuilding(building);
            socket.emit('new_building', JSON.stringify(snapshot));
            socket.emit('population:update', snapshot);
        }
    }

    listen(io) {
        this.io = io;
        this.cityManager.setIo(io);

        io.on('connection', (socket) => {
            debug(`Client connected ${socket.id}`);

            socket.on('new_building', (payload) => {
                this.handleNewBuilding(socket, payload);
            });

            socket.on('demolish_building', (payload) => {
                this.handleDemolish(socket, payload);
            });

            socket.on('factory:collect', (payload) => {
                this.handleFactoryCollect(socket, payload);
            });

            socket.on('disconnect', () => {
                this.removeBuildingsForSocket(socket.id);
            });

            this.sendSnapshot(socket);
            this.sendResearchSnapshot(socket);
        });
    }

    handleFactoryCollect(socket, payload) {
        let data = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch (error) {
                debug('Failed to parse factory collect payload', error);
                return;
            }
        }

        if (!data || !data.buildingId) {
            return;
        }

        const building = this.buildings.get(data.buildingId);
        if (!building) {
            return;
        }

        const player = this.game.players[socket.id];
        if (!player) {
            return;
        }

        const playerCity = toFiniteNumber(player.city, null);
        const buildingCity = toFiniteNumber(building.cityId, building.city);
        if (playerCity !== null && buildingCity !== null && playerCity !== buildingCity) {
            return;
        }

        const itemType = toFiniteNumber(data.type, null);
        const quantity = Math.max(1, toFiniteNumber(data.quantity, 1) || 1);
        const previous = Math.max(0, toFiniteNumber(building.itemsLeft, 0) || 0);

        // [SECURITY] Check inventory limit before dispensing
        let dispensed = Math.min(previous, quantity);
        let actualDispensed = 0;

        const owningCity = playerCity !== null ? playerCity : buildingCity;

        if (dispensed > 0 &&
            itemType !== ITEM_TYPE_ORB &&
            this.cityManager &&
            Number.isFinite(owningCity) &&
            itemType !== null) {
            // Try to pick up items, respecting inventory limit
            actualDispensed = this.cityManager.recordInventoryPickup(socket.id, owningCity, itemType, dispensed);
        } else if (dispensed > 0 && itemType === ITEM_TYPE_ORB) {
            // Orbs are special, handled below
            actualDispensed = dispensed;
        }

        if (actualDispensed > 0) {
            building.itemsLeft = previous - actualDispensed;
            this.emitPopulationUpdate(building);
        }

        if (dispensed > 0 &&
            itemType === ITEM_TYPE_ORB &&
            this.cityManager &&
            typeof this.cityManager.registerOrbHolder === 'function') {
            const owningCity = playerCity !== null ? playerCity : buildingCity;
            this.cityManager.registerOrbHolder(socket.id, owningCity);
        }
    }

    handleNewBuilding(socket, payload) {
        let buildingData = payload;
        if (typeof payload === 'string') {
            try {
                buildingData = JSON.parse(payload);
            } catch (error) {
                debug('Failed to parse building payload', error);
                return;
            }
        }

        buildingData.id = buildingData.id || `${buildingData.x}_${buildingData.y}`;
        buildingData.ownerId = socket.id;
        const playerState = this.game.players[socket.id];
        const resolvedCityId = buildingData.city !== undefined ? buildingData.city : (playerState?.city ?? 0);
        buildingData.city = resolvedCityId;
        buildingData.itemsLeft = buildingData.itemsLeft || 0;

        if (!playerState || playerState.city !== resolvedCityId) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'wrong_city',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        if (!playerState.isMayor) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'not_mayor',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        const city = this.cityManager.ensureCity(resolvedCityId);
        if (city.cash < COST_BUILDING) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'insufficient_funds',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        // [SECURITY] Server-side collision check
        if (this.checkBuildingCollision(buildingData)) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'collision',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        // [SECURITY] Server-side chain distance check
        if (!this.checkBuildingChain(buildingData, resolvedCityId)) {
            socket.emit('build:denied', JSON.stringify({
                reason: 'too_far',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
            }));
            return;
        }

        const requiredResearchType = this.getRequiredResearchType(buildingData.type);
        if (requiredResearchType !== null && !this.hasCompletedResearch(resolvedCityId, requiredResearchType)) {
            const state = this.getResearchState(resolvedCityId, requiredResearchType);
            socket.emit('build:denied', JSON.stringify({
                reason: 'research_pending',
                city: resolvedCityId,
                x: buildingData.x,
                y: buildingData.y,
                id: buildingData.id,
                researchType: requiredResearchType,
                completeAt: state?.completeAt || null,
            }));
            return;
        }

        const newBuilding = new Building(socket.id, buildingData, socket);

        if (isFactory(newBuilding.type)) {
            const factory = new FactoryBuilding(this.game, newBuilding);
            newBuilding.injectType(factory);
        }

        this.registerBuilding(socket.id, newBuilding);
        if (this.cityManager) {
            this.cityManager.registerBuilding(newBuilding);
        }
        this.cityManager.recordBuildingCost(newBuilding.cityId);

        if (isHouse(newBuilding.type)) {
            this.backfillAttachmentsForHouse(newBuilding);
        } else {
            this.ensureAttachment(newBuilding);
        }

        const snapshot = this.serializeBuilding(newBuilding);
        socket.broadcast.emit('new_building', JSON.stringify(snapshot));
        this.emitPopulationUpdate(newBuilding);
    }

    handleDemolish(socket, payload) {
        let data = payload;
        if (typeof payload === 'string') {
            try {
                data = JSON.parse(payload);
            } catch (error) {
                debug('Failed to parse demolish payload', error);
                return;
            }
        }

        if (!data || !data.id) {
            this.emitDemolishDenied(socket, null, 'invalid_payload');
            return;
        }

        const building = this.buildings.get(data.id);
        if (!building) {
            debug(`Demolish ignored for missing building id=${data.id}`);
            this.emitDemolishDenied(socket, data.id, 'not_found');
            return;
        }

        if (typeof building.ownerId === 'string' && building.ownerId.startsWith('fake_city_')) {
            debug(`Demolish denied for fake city structure ${data.id} owner=${building.ownerId} requestedBy=${socket.id}`);
            this.emitDemolishDenied(socket, building.id, 'protected');
            return;
        }

        // Check if player is the current mayor of the building's city
        const player = this.game.players[socket.id];
        if (!player) {
            debug(`Demolish denied for ${data.id} - player not found`);
            this.emitDemolishDenied(socket, building.id, 'not_authorized');
            return;
        }

        const buildingCityId = building.cityId ?? building.city ?? 0;
        const playerCityId = player.city ?? 0;

        // Player must be mayor of the same city as the building
        if (!player.isMayor || playerCityId !== buildingCityId) {
            debug(`Demolish denied for ${data.id} - player is not mayor of building's city (playerCity=${playerCityId}, buildingCity=${buildingCityId}, isMayor=${player.isMayor})`);
            this.emitDemolishDenied(socket, building.id, 'not_mayor');
            return;
        }

        debug(`Demolish approved for ${data.id} by mayor ${socket.id} of city ${buildingCityId}`);
        this.removeBuilding(building.id);
    }

    emitDemolishDenied(socket, id, reason) {
        if (!socket) {
            return;
        }
        const payload = {
            id: id || null,
            reason: reason || 'denied'
        };
        socket.emit('demolish:denied', payload);
    }

    spawnStaticBuilding(data) {
        if (!data || data.x === undefined || data.y === undefined || data.type === undefined) {
            return null;
        }
        const cityId = data.city !== undefined ? data.city : (data.cityId !== undefined ? data.cityId : 0);
        const ownerId = data.ownerId || `fake_city_${cityId}`;
        const buildingId = data.id || `fake_${cityId}_${data.x}_${data.y}`;
        if (this.buildings.has(buildingId)) {
            return this.buildings.get(buildingId);
        }

        const buildingPayload = {
            id: buildingId,
            x: data.x,
            y: data.y,
            type: data.type,
            city: cityId,
            itemsLeft: data.itemsLeft || 0,
        };

        const newBuilding = new Building(ownerId, buildingPayload, null);

        if (isFactory(newBuilding.type)) {
            const factory = new FactoryBuilding(this.game, newBuilding);
            newBuilding.injectType(factory);
        }

        this.registerBuilding(ownerId, newBuilding);
        if (this.cityManager) {
            this.cityManager.registerBuilding(newBuilding);
        }

        if (isHouse(newBuilding.type)) {
            this.backfillAttachmentsForHouse(newBuilding);
        } else {
            this.ensureAttachment(newBuilding);
        }

        if (this.io) {
            const snapshot = this.serializeBuilding(newBuilding);
            this.io.emit('new_building', JSON.stringify(snapshot));
            this.emitPopulationUpdate(newBuilding);
        }

        return newBuilding;
    }

    registerBuilding(socketId, building) {
        this.buildings.set(building.id, building);
        if (!this.buildingsBySocket.has(socketId)) {
            this.buildingsBySocket.set(socketId, new Set());
        }
        this.buildingsBySocket.get(socketId).add(building.id);
    }

    removeBuildingsForSocket(socketId) {
        const ids = this.buildingsBySocket.get(socketId);
        if (!ids) {
            return;
        }
        this.buildingsBySocket.delete(socketId);
        ids.forEach((id) => {
            const building = this.buildings.get(id);
            if (building) {
                building.socket = null;
            }
        });
    }

    removeBuilding(id, broadcast = true) {
        const building = this.buildings.get(id);
        if (!building) {
            return;
        }

        debug(`Removing building ${id}`);

        if (!isHouse(building.type)) {
            this.detachFromHouse(building);
        } else {
            building.attachments.forEach((slot) => {
                const attached = this.buildings.get(slot.buildingId);
                if (attached) {
                    attached.attachedHouseId = null;
                    attached.population = 0;
                    this.emitPopulationUpdate(attached);
                }
            });
        }

        if (isFactory(building.type)) {
            this.handleFactoryDestroyed(building);
        }

        this.buildings.delete(id);

        const socketSet = this.buildingsBySocket.get(building.ownerId);
        if (socketSet) {
            socketSet.delete(id);
            if (socketSet.size === 0) {
                this.buildingsBySocket.delete(building.ownerId);
            }
        }

        if (this.cityManager) {
            this.cityManager.unregisterBuilding(building);
        }

        building.population = 0;
        this.emitPopulationUpdate(building, true);

        if (broadcast && this.io) {
            this.io.emit('demolish_building', JSON.stringify({ id }));
        }
    }

    handleFactoryDestroyed(building) {
        const itemType = Number(building.type % 100);
        if (!Number.isFinite(itemType)) {
            return;
        }
        const rawCityId = building.cityId ?? building.city;
        const cityId = toFiniteNumber(rawCityId, null);
        const normalisedCityId = Number.isFinite(cityId) ? cityId : null;
        building.itemsLeft = 0;

        if (this.hazardManager &&
            HAZARD_ITEM_TYPES.has(itemType) &&
            typeof this.hazardManager.removeHazardsByCityAndItem === 'function') {
            this.hazardManager.removeHazardsByCityAndItem(normalisedCityId, itemType, 'factory_destroyed');
        }

        if (this.defenseManager &&
            DEFENSE_ITEM_TYPES.has(itemType) &&
            typeof this.defenseManager.removeDefensesByType === 'function') {
            this.defenseManager.removeDefensesByType(normalisedCityId, itemType, { broadcast: true });
        }

        if (itemType === ITEM_TYPE_ORB &&
            this.cityManager &&
            typeof this.cityManager.clearOrbHoldersForCity === 'function' &&
            normalisedCityId !== null) {
            this.cityManager.clearOrbHoldersForCity(normalisedCityId, { consume: true });
        }

        if (this.cityManager && normalisedCityId !== null) {
            this.cityManager.clearInventoryForType(normalisedCityId, itemType);
        }

        this.broadcastFactoryPurge(normalisedCityId, itemType);
    }

    getBuildingFootprint(building) {
        const fallback = {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES,
        };
        if (!building) {
            return fallback;
        }
        const explicitWidth = Number.isFinite(building.width) ? building.width : null;
        const explicitHeight = Number.isFinite(building.height) ? building.height : null;
        if (explicitWidth !== null && explicitHeight !== null) {
            return {
                width: explicitWidth,
                height: explicitHeight,
            };
        }
        const numericType = Number(building.type);
        if (Number.isFinite(numericType)) {
            if (isHouse(numericType)) {
                return { width: 1, height: 1 };
            }
            if (isCommandCenter(numericType) || isHospital(numericType)) {
                return {
                    width: COMMAND_CENTER_WIDTH_TILES,
                    height: COMMAND_CENTER_HEIGHT_TILES,
                };
            }
        }
        return fallback;
    }

    destroyBuildingsInRadius(centerTileX, centerTileY, radiusTiles, options = {}) {
        const centerX = Number.isFinite(centerTileX) ? Math.floor(centerTileX) : null;
        const centerY = Number.isFinite(centerTileY) ? Math.floor(centerTileY) : null;
        const radius = Number.isFinite(radiusTiles) ? Math.max(0, Math.floor(radiusTiles)) : null;
        if (centerX === null || centerY === null || radius === null) {
            return 0;
        }

        const excludeTypes = options.excludeTypes instanceof Set ? options.excludeTypes : null;
        const excludeCommandCenters = options.excludeCommandCenters !== false;
        const broadcast = options.broadcast !== false;
        const reason = typeof options.reason === 'string' ? options.reason : 'destroyed';
        const hazardId = options.hazard?.id;
        const destroyed = [];

        for (const building of this.buildings.values()) {
            const tileX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
            const tileY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
            if (tileX === null || tileY === null) {
                continue;
            }
            const footprint = this.getBuildingFootprint(building);
            const widthTiles = Math.max(1, Math.floor(Number.isFinite(footprint.width) ? footprint.width : COMMAND_CENTER_WIDTH_TILES));
            const heightTiles = Math.max(1, Math.floor(Number.isFinite(footprint.height) ? footprint.height : COMMAND_CENTER_HEIGHT_TILES));
            const minTileX = tileX;
            const maxTileX = tileX + widthTiles - 1;
            const minTileY = tileY;
            const maxTileY = tileY + heightTiles - 1;
            const nearestX = Math.max(minTileX, Math.min(centerX, maxTileX));
            const nearestY = Math.max(minTileY, Math.min(centerY, maxTileY));
            if (Math.abs(nearestX - centerX) > radius || Math.abs(nearestY - centerY) > radius) {
                continue;
            }
            if (excludeCommandCenters && isCommandCenter(building.type)) {
                continue;
            }
            if (excludeTypes && excludeTypes.has(building.type)) {
                continue;
            }
            destroyed.push(building);
        }

        if (destroyed.length === 0) {
            return 0;
        }

        destroyed.forEach((building) => {
            debug(`[${reason}] Destroying building ${building.id} (${building.type}) at ${building.x},${building.y}${hazardId ? ` via hazard ${hazardId}` : ''}`);
            this.removeBuilding(building.id, broadcast);
        });

        if (typeof options.onDestroy === 'function') {
            try {
                options.onDestroy(destroyed);
            } catch (error) {
                debug('destroyBuildingsInRadius callback failed', error);
            }
        }

        return destroyed.length;
    }

    broadcastFactoryPurge(cityId, itemType) {
        if (!this.io || !Number.isFinite(itemType)) {
            return;
        }
        const payload = {
            cityId: cityId,
            itemType: Math.floor(itemType),
        };
        this.io.emit('factory:purge', JSON.stringify(payload));
    }

    getResearchKey(cityId, researchType) {
        return `${cityId}:${researchType}`;
    }

    getResearchBucket(cityId, create = false) {
        const numericCity = toFiniteNumber(cityId, null);
        if (numericCity === null) {
            return null;
        }
        if (!this.researchByCity.has(numericCity)) {
            if (!create) {
                return null;
            }
            this.researchByCity.set(numericCity, new Map());
        }
        return this.researchByCity.get(numericCity);
    }

    getResearchState(cityId, researchType, { create = false } = {}) {
        const bucket = this.getResearchBucket(cityId, create);
        const numericType = toFiniteNumber(researchType, null);
        if (!bucket || numericType === null) {
            return null;
        }
        if (!bucket.has(numericType)) {
            if (!create) {
                return null;
            }
            bucket.set(numericType, {
                state: 'idle',
                startedAt: null,
                completeAt: null,
                completedAt: null,
                buildingId: null,
            });
        }
        return bucket.get(numericType);
    }

    emitResearchUpdate(cityId, researchType, state) {
        if (!this.io) {
            return;
        }
        const payload = {
            cityId: toFiniteNumber(cityId, null),
            researchType: toFiniteNumber(researchType, null),
            state: state?.state || 'idle',
            completeAt: state?.completeAt || null,
        };
        this.io.emit('research:update', JSON.stringify(payload));
    }

    startResearch(cityId, researchType, buildingId, now = null) {
        const state = this.getResearchState(cityId, researchType, { create: true });
        if (!state || state.state === 'complete') {
            return state;
        }
        if (state.state === 'pending' && state.completeAt) {
            return state;
        }
        const currentTick = now ?? this.game.tick ?? Date.now();
        state.state = 'pending';
        state.startedAt = currentTick;
        state.completeAt = currentTick + RESEARCH_DURATION_MS;
        state.buildingId = buildingId || state.buildingId || null;
        this.emitResearchUpdate(cityId, researchType, state);
        return state;
    }

    completeResearch(cityId, researchType) {
        const state = this.getResearchState(cityId, researchType, { create: true });
        if (!state || state.state === 'complete') {
            return state;
        }
        state.state = 'complete';
        state.completeAt = null;
        state.completedAt = this.game.tick || Date.now();
        this.emitResearchUpdate(cityId, researchType, state);
        return state;
    }

    cancelResearch(cityId, researchType) {
        const state = this.getResearchState(cityId, researchType);
        if (!state || state.state !== 'pending') {
            return;
        }
        state.state = 'idle';
        state.startedAt = null;
        state.completeAt = null;
        state.buildingId = null;
        this.emitResearchUpdate(cityId, researchType, state);
    }

    hasCompletedResearch(cityId, researchType) {
        const state = this.getResearchState(cityId, researchType);
        return !!state && state.state === 'complete';
    }

    getRequiredResearchType(buildingType) {
        const numericType = toFiniteNumber(buildingType, null);
        if (numericType === null) {
            return null;
        }
        const family = Math.floor(numericType / 100);
        if (family === 1) {
            return numericType + 300;
        }
        if (numericType === 200 || numericType === 301) {
            return 402;
        }
        return null;
    }

    advanceResearchForBuilding(building, activeResearchKeys, now) {
        if (!isResearch(building.type)) {
            return;
        }
        const cityId = toFiniteNumber(building.cityId ?? building.city, null);
        if (cityId === null) {
            return;
        }
        const researchType = toFiniteNumber(building.type, null);
        const key = this.getResearchKey(cityId, researchType);
        const hasPopulation = building.population >= POPULATION_MAX_NON_HOUSE;
        if (hasPopulation) {
            activeResearchKeys.add(key);
            this.startResearch(cityId, researchType, building.id, now);
            const state = this.getResearchState(cityId, researchType);
            if (state && state.state === 'pending' && state.completeAt !== null && now >= state.completeAt) {
                this.completeResearch(cityId, researchType);
            }
        }
    }

    cancelInactiveResearch(activeResearchKeys, now) {
        for (const [cityId, researchMap] of this.researchByCity.entries()) {
            for (const [researchType, state] of researchMap.entries()) {
                const key = this.getResearchKey(cityId, researchType);
                if (state.state === 'pending') {
                    if (!activeResearchKeys.has(key)) {
                        this.cancelResearch(cityId, researchType);
                    } else if (state.completeAt !== null && now >= state.completeAt) {
                        this.completeResearch(cityId, researchType);
                    }
                }
            }
        }
    }

    sendResearchSnapshot(socket) {
        if (!socket || !this.researchByCity.size) {
            return;
        }
        for (const [cityId, researchMap] of this.researchByCity.entries()) {
            for (const [researchType, state] of researchMap.entries()) {
                if (!state || state.state === 'idle') {
                    continue;
                }
                const payload = {
                    cityId,
                    researchType,
                    state: state.state,
                    completeAt: state.completeAt || null,
                };
                socket.emit('research:update', JSON.stringify(payload));
            }
        }
    }

    cycle() {
        const activeResearchKeys = new Set();
        const now = this.game.tick || Date.now();
        for (const building of this.buildings.values()) {
            building.cycle(this.game, this);
            this.advanceResearchForBuilding(building, activeResearchKeys, now);
        }
        this.cancelInactiveResearch(activeResearchKeys, now);
        this.cityManager.cycle(this.game.tick);
    }

    ensureAttachment(building) {
        if (isHouse(building.type)) {
            return building;
        }

        if (building.attachedHouseId) {
            const existingHouse = this.buildings.get(building.attachedHouseId);
            if (existingHouse && existingHouse.attachments.some((slot) => slot.buildingId === building.id)) {
                return existingHouse;
            }
            building.attachedHouseId = null;
        }

        const house = this.findAvailableHouse(building.ownerId, building.cityId);
        if (!house) {
            return null;
        }

        this.attachBuildingToHouse(house, building);
        return house;
    }

    findAvailableHouse(ownerId, cityId) {
        let bestHouse = null;
        for (const candidate of this.buildings.values()) {
            if (!isHouse(candidate.type)) {
                continue;
            }
            const sameOwner = candidate.ownerId === ownerId;
            const sameCity = candidate.cityId === cityId;
            if (!sameCity && !sameOwner) {
                continue;
            }
            if (candidate.attachments.length >= 2) {
                continue;
            }
            if (!bestHouse || candidate.attachments.length < bestHouse.attachments.length) {
                bestHouse = candidate;
                if (bestHouse.attachments.length === 0) {
                    break;
                }
            }
        }
        return bestHouse;
    }

    attachBuildingToHouse(house, building) {
        this.cityManager.ensureCity(house.cityId);
        house.attachments.push({ buildingId: building.id, population: building.population });
        building.attachedHouseId = house.id;
        building.cityId = house.cityId;
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(building);
        this.emitPopulationUpdate(house);
    }

    detachFromHouse(building) {
        if (!building.attachedHouseId) {
            return;
        }

        const house = this.buildings.get(building.attachedHouseId);
        building.attachedHouseId = null;

        if (!house) {
            building.population = 0;
            this.emitPopulationUpdate(building);
            return;
        }

        house.attachments = house.attachments.filter((slot) => slot.buildingId !== building.id);
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(house);

        building.population = 0;
        building.itemsLeft = 0;
        this.emitPopulationUpdate(building);
    }

    updateHouseAttachment(house, building) {
        if (!house) {
            return;
        }

        const slot = house.attachments.find((item) => item.buildingId === building.id);
        if (slot) {
            slot.population = building.population;
        } else {
            house.attachments.push({ buildingId: building.id, population: building.population });
        }
        this.updateHousePopulation(house);
        this.emitPopulationUpdate(house);
    }

    updateHousePopulation(house) {
        const total = house.attachments.reduce((sum, slot) => sum + slot.population, 0);
        house.population = Math.min(POPULATION_MAX_HOUSE, total);
    }

    backfillAttachmentsForHouse(house) {
        this.cityManager.ensureCity(house.cityId);
        for (const building of this.buildings.values()) {
            if (isHouse(building.type) || building.attachedHouseId) {
                continue;
            }
            if (building.ownerId !== house.ownerId && building.cityId !== house.cityId) {
                continue;
            }
            if (house.attachments.length >= 2) {
                break;
            }
            this.attachBuildingToHouse(house, building);
            this.emitPopulationUpdate(building);
        }
        this.emitPopulationUpdate(house);
    }

    emitPopulationUpdate(building, removed = false) {
        if (!this.io) {
            return;
        }
        const payload = { ...this.serializeBuilding(building), removed };
        this.io.emit('population:update', payload);
    }

    destroyCity(cityId, options = {}) {
        const numericId = Number(cityId);
        if (!Number.isFinite(numericId)) {
            return 0;
        }
        const broadcast = options.broadcast !== false;
        const buildings = Array.from(this.buildings.values()).filter((building) => {
            const candidateCity = building.cityId ?? building.city ?? 0;
            return Number(candidateCity) === numericId;
        });
        let removed = 0;
        for (const building of buildings) {
            this.removeBuilding(building.id, broadcast);
            removed += 1;
        }
        if (this.cityManager) {
            this.cityManager.clearCityInventory(numericId);
        }
        return removed;
    }

    getCityFactoryStock(cityId, itemType = null) {
        const numericCity = toFiniteNumber(cityId, null);
        const targetType = itemType !== null ? normalizeItemType(itemType, null) : null;
        if (numericCity === null) {
            return 0;
        }
        let total = 0;
        for (const building of this.buildings.values()) {
            if (!isFactory(building.type)) {
                continue;
            }
            const buildingCity = toFiniteNumber(building.cityId ?? building.city, null);
            if (buildingCity !== numericCity) {
                continue;
            }
            const buildingType = normalizeItemType(building.type % 100, null);
            if (targetType !== null && buildingType !== targetType) {
                continue;
            }
            const itemsLeft = toFiniteNumber(building.itemsLeft, 0) || 0;
            if (itemsLeft > 0) {
                total += itemsLeft;
            }
        }
        return total;
    }

    getCityOutstandingItemCount(cityId, itemType) {
        const numericCity = toFiniteNumber(cityId, null);
        const targetType = normalizeItemType(itemType, null);
        if (numericCity === null || targetType === null) {
            return 0;
        }
        const factoryStock = this.getCityFactoryStock(numericCity, targetType);
        let inventoryStock = 0;
        if (this.cityManager && typeof this.cityManager.getInventoryCount === 'function') {
            inventoryStock = this.cityManager.getInventoryCount(numericCity, targetType);
        }
        let deployedStock = 0;
        if (this.hazardManager && typeof this.hazardManager.getOutstandingCount === 'function') {
            deployedStock += this.hazardManager.getOutstandingCount(numericCity, targetType);
        }
        if (this.defenseManager && typeof this.defenseManager.getOutstandingCount === 'function') {
            deployedStock += this.defenseManager.getOutstandingCount(numericCity, targetType);
        }
        return factoryStock + inventoryStock + deployedStock;
    }

    hasActiveResearch(cityId) {
        const numericCity = toFiniteNumber(cityId, null);
        if (numericCity === null) {
            return false;
        }
        for (const building of this.buildings.values()) {
            if (!isResearch(building.type)) {
                continue;
            }
            const buildingCity = toFiniteNumber(building.cityId ?? building.city, null);
            if (buildingCity !== numericCity) {
                continue;
            }
            if (building.population >= POPULATION_MAX_NON_HOUSE) {
                return true;
            }
        }
        const bucket = this.researchByCity.get(numericCity);
        if (bucket) {
            for (const state of bucket.values()) {
                if (state && (state.state === 'pending' || state.state === 'complete')) {
                    return true;
                }
            }
        }
        return false;
    }

    hasActiveResearchForBuildingType(cityId, buildingType) {
        const numericCity = toFiniteNumber(cityId, null);
        const numericBuildingType = toFiniteNumber(buildingType, null);
        if (numericCity === null || numericBuildingType === null) {
            return false;
        }
        const requiredResearchType = this.getRequiredResearchType(numericBuildingType);
        if (requiredResearchType === null) {
            return true;
        }
        for (const building of this.buildings.values()) {
            if (!isResearch(building.type)) {
                continue;
            }
            const buildingCity = toFiniteNumber(building.cityId ?? building.city, null);
            if (buildingCity !== numericCity) {
                continue;
            }
            if (building.type === requiredResearchType && building.population >= POPULATION_MAX_NON_HOUSE) {
                return true;
            }
        }
        return false;
    }
    checkBuildingCollision(buildingData) {
        const TILE_SIZE = 48;
        const BUILDING_SIZE_TILES = 3; // Buildings are 3x3 tiles

        debug(`Checking collision for building at tile (${buildingData.x}, ${buildingData.y})`);

        // Check against map boundaries (buildingData.x and buildingData.y are in TILES)
        if (buildingData.x < 0 || buildingData.y < 0 ||
            buildingData.x + BUILDING_SIZE_TILES > 512 ||
            buildingData.y + BUILDING_SIZE_TILES > 512) {
            debug(`Building rejected: out of bounds`);
            return true;
        }

        const rect = {
            x: buildingData.x * TILE_SIZE,
            y: buildingData.y * TILE_SIZE,
            w: TILE_SIZE * BUILDING_SIZE_TILES,
            h: TILE_SIZE * BUILDING_SIZE_TILES
        };

        // Check against existing buildings
        for (const existing of this.buildings.values()) {
            if (existing.id === buildingData.id) continue;
            const existingRect = {
                x: existing.x * TILE_SIZE,
                y: existing.y * TILE_SIZE,
                w: TILE_SIZE * BUILDING_SIZE_TILES,
                h: TILE_SIZE * BUILDING_SIZE_TILES
            };
            if (rectangleCollision(rect, existingRect)) {
                debug(`Building rejected: collision with existing building at tile (${existing.x}, ${existing.y})`);
                return true;
            }
        }

        debug(`Building placement OK`);
        // TODO: Check against map blocking tiles (rocks, water) if map data is available here
        // For now, building collision is the most critical for preventing stacking
        return false;
    }

    checkBuildingChain(buildingData, cityId) {
        // Command centers are the root, always allowed if no collision
        if (Number(buildingData.type) === 0) {
            debug(`Building is Command Center, chain check passed`);
            return true;
        }

        const TILE_SIZE = 48;
        // MAX_BUILDING_CHAIN_DISTANCE is in pixels (960), convert to tiles (20)
        const MAX_DIST_TILES = MAX_BUILDING_CHAIN_DISTANCE / TILE_SIZE;
        const MAX_DIST_SQ = MAX_DIST_TILES * MAX_DIST_TILES;
        const x = buildingData.x; // in tiles
        const y = buildingData.y; // in tiles

        debug(`Checking building chain for city ${cityId}, max distance: ${MAX_DIST_TILES} tiles`);
        debug(`Total buildings in map: ${this.buildings.size}`);

        let cityBuildingCount = 0;
        for (const existing of this.buildings.values()) {
            debug(`  Building: type=${existing.type}, cityId=${existing.cityId}, pos=(${existing.x}, ${existing.y})`);

            // Must belong to same city/team
            if (existing.cityId !== cityId) continue;

            cityBuildingCount++;

            const dx = existing.x - x; // tile distance
            const dy = existing.y - y; // tile distance
            const distSq = (dx * dx) + (dy * dy);

            if (distSq <= MAX_DIST_SQ) {
                debug(`Building within range of existing building at (${existing.x}, ${existing.y}), distance: ${Math.sqrt(distSq).toFixed(1)} tiles`);
                return true;
            }
        }

        // If city has no buildings yet, this shouldn't happen (Command Center should exist)
        // but allow it anyway to prevent soft-lock
        if (cityBuildingCount === 0) {
            debug(`No existing buildings for city ${cityId}, allowing placement`);
            return true;
        }

        debug(`Building too far from any existing city buildings (checked ${cityBuildingCount} buildings)`);
        return false;
    }
}

module.exports = BuildingFactory;
