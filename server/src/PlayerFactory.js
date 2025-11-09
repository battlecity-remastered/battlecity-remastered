/*jslint node: true */
"use strict";

var Player = require("./Player");
var PlayerStateValidator = require("./validation/PlayerStateValidator");

var debug = require('debug')('BattleCity:PlayerFactory');
var { TILE_SIZE, MAX_HEALTH, TIMER_CLOAK, TIMER_DFG } = require('./gameplay/constants');
var { rectangleCollision, getPlayerRect } = require('./gameplay/geometry');
var { isHospitalBuilding, getHospitalDriveableRect } = require('./utils/buildings');
var citySpawns = require('../../shared/citySpawns.json');
var CallsignRegistry = require('./utils/callsigns');
const { ITEM_TYPES } = require('./items');

const HALF_TILE = TILE_SIZE / 2;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const COMMAND_CENTER_FRONT_OFFSET = TILE_SIZE / 2;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const PLAYER_SPAWN_ADJUST_X = 6.5;
const PLAYER_SPAWN_ADJUST_Y = 5.5;
const HOSPITAL_HEAL_INTERVAL = 150;
const HOSPITAL_HEAL_AMOUNT = 2;

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

const normaliseCityIdValue = (value, fallback = null) => {
    const numeric = toFiniteNumber(value, fallback);
    if (!Number.isFinite(numeric)) {
        return fallback;
    }
    return Math.max(0, Math.floor(numeric));
};

const normaliseRoleValue = (value) => {
    if (!value) {
        return null;
    }
    if (typeof value !== 'string') {
        return null;
    }
    const trimmed = value.trim().toLowerCase();
    if (!trimmed) {
        return null;
    }
    if (trimmed === 'mayor' || trimmed === 'm') {
        return 'mayor';
    }
    if (trimmed === 'recruit' || trimmed === 'commando' || trimmed === 'r') {
        return 'recruit';
    }
    if (trimmed === 'auto' || trimmed === 'any') {
        return 'auto';
    }
    return null;
};

const shortenId = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }
    if (value.length <= 8) {
        return value;
    }
    return `${value.slice(0, 4)}...${value.slice(-2)}`;
};

class PlayerFactory {

    constructor(game, options = {}) {
        this.game = game;
        this.validator = new PlayerStateValidator();
        this.io = null;
        this.cityRosters = new Map();
        this.cityCursor = 0;
        this.maxRecruitsPerCity = 3;
        const spawnKeys = Object.keys(citySpawns || {})
            .map((key) => Number(key))
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => a - b);
        this.defaultCityPool = spawnKeys.length ? spawnKeys : [0, 1];
        this.citySpawns = citySpawns || {};
        this.lobbyVersion = 0;
        this.callsigns = new CallsignRegistry();
        this.chatManager = null;
        this.userStore = options.userStore || null;
        this.scoreService = options.scoreService || null;
        this.notifier = options.notifier || null;
    }

    listen(io) {

        debug("Starting Server");
        this.io = io;

        io.on("connection", (socket) => {

            this.emitLobbySnapshot(socket);

            socket.on('lobby:refresh', () => {
                this.emitLobbySnapshot(socket);
            });

            socket.on('enter_game', (player) => {
                debug("Player entered game " + socket.id);
                const existing = this.game.players[socket.id];
                if (existing) {
                    if (this.game.buildingFactory && this.game.buildingFactory.cityManager) {
                        this.game.buildingFactory.cityManager.releasePlayerInventory(socket.id);
                    }
                    this.releaseSlot(existing);
                    delete this.game.players[socket.id];
                }

                const parsedPlayer = this.safeParse(player);
                const identity = this.resolveIdentityFromPayload(parsedPlayer);
                const preferences = this.extractAssignmentPreferences(parsedPlayer);
                const assignment = this.assignCityAndRole(socket.id, preferences);
                if (assignment.overflow) {
                    debug(`No available city slots for player ${socket.id}, rejecting entry`);
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: ['cities_full'],
                        flags: ['wait_for_slot']
                    }));
                    socket.emit('lobby:denied', JSON.stringify({
                        reason: 'cities_full',
                        requestedCity: preferences.city,
                        requestedRole: preferences.role
                    }));
                    return;
                }
                const spawn = this.getSpawnForCity(assignment.city);

                const normalized = Object.assign({}, parsedPlayer, {
                    city: assignment.city,
                    isMayor: assignment.isMayor
                });
                if (spawn) {
                    normalized.offset = {
                        x: spawn.x,
                        y: spawn.y
                    };
                }
                var validation = this.validator.initializePlayerState(normalized, { now: Date.now() });
                validation.sanitized.city = assignment.city;
                validation.sanitized.isMayor = assignment.isMayor;
                if (spawn) {
                    validation.sanitized.offset = {
                        x: spawn.x,
                        y: spawn.y
                    };
                }

                const initialState = Object.assign({}, validation.sanitized);
                if (identity) {
                    initialState.userId = identity.id;
                    initialState.callsign = identity.name;
                }

                var newPlayer = new Player(socket.id, initialState, validation.timestamp);
                newPlayer.city = assignment.city;
                newPlayer.isMayor = assignment.isMayor;
                if (parsedPlayer && parsedPlayer.isFake) {
                    newPlayer.isFake = true;
                }
                if (parsedPlayer && parsedPlayer.isFakeRecruit) {
                    newPlayer.isFakeRecruit = true;
                }
                if (spawn) {
                    newPlayer.offset.x = spawn.x;
                    newPlayer.offset.y = spawn.y;
                }
                this.applyIdentityToPlayer(newPlayer, identity);
                this.game.players[socket.id] = newPlayer;
                this.registerAssignment(newPlayer, assignment);

                if (this.chatManager && typeof this.chatManager.sendHistoryForSocket === 'function') {
                    this.chatManager.sendHistoryForSocket(socket.id);
                }

                debug(`Assigned player ${socket.id} -> city ${assignment.city} (${assignment.isMayor ? 'mayor' : 'recruit'})${assignment.overflow ? ' [overflow]' : ''} (${assignment.source || 'auto'})`);

                if (preferences.requested && assignment.source === 'fallback') {
                    socket.emit('lobby:denied', JSON.stringify({
                        reason: 'slot_unavailable',
                        requestedCity: preferences.city,
                        requestedRole: preferences.role
                    }));
                }

                socket.emit('lobby:assignment', JSON.stringify({
                    city: assignment.city,
                    role: assignment.isMayor ? 'mayor' : 'recruit',
                    source: assignment.source
                }));

                socket.emit('player', JSON.stringify(newPlayer));
                socket.emit('players:snapshot', JSON.stringify(this.serializePlayers(socket.id)));
                io.emit('enter_game', JSON.stringify(newPlayer));
                io.emit('player', JSON.stringify(newPlayer));
                this.notifyPlayerJoined(newPlayer);
            });

            socket.on('player', (player) => {
                var existingPlayer = this.game.players[socket.id];
                if (!existingPlayer) {
                    return;
                }

                var parsedPlayer = this.safeParse(player);
                const now = Date.now();
                if (parsedPlayer && (existingPlayer.isFake || existingPlayer.isSystemControlled || existingPlayer.isFakeRecruit)) {
                    if (parsedPlayer.sequence !== undefined && Number.isFinite(parsedPlayer.sequence)) {
                        if (existingPlayer.sequence !== undefined && parsedPlayer.sequence <= existingPlayer.sequence) {
                            return;
                        }
                        existingPlayer.sequence = Math.max(existingPlayer.sequence || 0, Math.floor(parsedPlayer.sequence));
                    }
                    if (parsedPlayer.offset && typeof parsedPlayer.offset === 'object') {
                        const x = Number(parsedPlayer.offset.x);
                        const y = Number(parsedPlayer.offset.y);
                        if (Number.isFinite(x)) existingPlayer.offset.x = x;
                        if (Number.isFinite(y)) existingPlayer.offset.y = y;
                    }
                    if (parsedPlayer.direction !== undefined) {
                        const dir = Number(parsedPlayer.direction);
                        if (Number.isFinite(dir)) existingPlayer.direction = Math.round(dir) % 32;
                    }
                    if (parsedPlayer.isMoving !== undefined) {
                        existingPlayer.isMoving = parsedPlayer.isMoving;
                    }
                    if (parsedPlayer.isTurning !== undefined) {
                        existingPlayer.isTurning = parsedPlayer.isTurning;
                    }
                    existingPlayer.lastUpdateAt = now;
                    if (this.io) {
                        this.io.emit('player', JSON.stringify(existingPlayer));
                    }
                    return;
                }

                var validation = this.validator.validatePlayerUpdate(existingPlayer, parsedPlayer, { now });
                if (!validation) {
                    return;
                }

                if (validation.sanitized) {
                    validation.sanitized.city = existingPlayer.city;
                    validation.sanitized.isMayor = existingPlayer.isMayor;
                }

                if (existingPlayer.sequence !== undefined &&
                    validation.sanitized &&
                    validation.sanitized.sequence !== undefined &&
                    validation.sanitized.sequence <= existingPlayer.sequence) {
                    debug("Ignoring out-of-order update from " + socket.id + " sequence " + validation.sanitized.sequence);
                    return;
                }

                if (!validation.valid) {
                    debug("Rejected player update for " + socket.id + " reasons: " + validation.reasons.join(","));
                    socket.emit('player:rejected', JSON.stringify({
                        reasons: validation.reasons,
                        flags: validation.flags,
                        player: existingPlayer
                    }));
                    socket.emit('player', JSON.stringify(existingPlayer));
                    return;
                }

                existingPlayer.update(validation.sanitized, validation.timestamp);
                io.emit('player', JSON.stringify(existingPlayer));
            });

            socket.on('identity:update', (payload) => {
                const player = this.game.players[socket.id];
                if (!player) {
                    return;
                }
                const request = this.safeParse(payload);
                if (request && Object.prototype.hasOwnProperty.call(request, 'identity') && request.identity === null) {
                    this.applyIdentityToPlayer(player, null);
                    if (this.io) {
                        this.io.emit('player', JSON.stringify(player));
                    }
                    socket.emit('identity:ack', JSON.stringify({ status: 'ok', id: null, name: null }));
                    return;
                }
                const identity = this.resolveIdentityFromPayload(request);
                if (!identity) {
                    socket.emit('identity:ack', JSON.stringify({ status: 'error', reason: 'not_found' }));
                    return;
                }
                this.applyIdentityToPlayer(player, identity);
                if (this.io) {
                    this.io.emit('player', JSON.stringify(player));
                }
                socket.emit('identity:ack', JSON.stringify({ status: 'ok', id: identity.id, name: identity.name }));
            });

            socket.on('item:use', (payload) => {
                this.handleItemUse(socket, payload);
            });

            socket.on('disconnect', () => {
                var removedPlayer = this.game.players[socket.id];
                if (!removedPlayer) {
                    return;
                }
                if (this.game.buildingFactory && this.game.buildingFactory.cityManager) {
                    this.game.buildingFactory.cityManager.releasePlayerInventory(socket.id);
                }
                if (this.game.buildingFactory &&
                    this.game.buildingFactory.cityManager &&
                    typeof this.game.buildingFactory.cityManager.releaseOrbHolder === 'function') {
                    this.game.buildingFactory.cityManager.releaseOrbHolder(socket.id, { consume: true });
                }
                this.releaseSlot(removedPlayer);
                delete this.game.players[socket.id];
                this.callsigns.release(socket.id);
                io.emit('player:removed', JSON.stringify({id: removedPlayer.id}));
                this.notifyPlayerLeft(removedPlayer);
            });
        });
    }

    setChatManager(chatManager) {
        this.chatManager = chatManager;
    }

    setScoreService(scoreService) {
        this.scoreService = scoreService || null;
    }

    setNotifier(notifier) {
        this.notifier = notifier || null;
    }

    notifyPlayerJoined(player) {
        if (!player) {
            return;
        }
        if (!this.notifier || typeof this.notifier.notifyPlayerJoined !== 'function') {
            return;
        }
        const payload = {
            playerId: player.id,
            userId: player.userId || null,
            callsign: player.callsign || null,
            displayName: this.getPlayerDisplayName(player),
            cityId: Number.isFinite(player.city) ? Math.floor(player.city) : null,
            cityName: this.getCityDisplayName(player.city),
            isMayor: !!player.isMayor,
            isFake: !!player.isFake,
        };
        this.invokeNotifier(() => this.notifier.notifyPlayerJoined(payload));
    }

    notifyPlayerLeft(player) {
        if (!player) {
            return;
        }
        if (!this.notifier || typeof this.notifier.notifyPlayerLeft !== 'function') {
            return;
        }
        const payload = {
            playerId: player.id,
            userId: player.userId || null,
            callsign: player.callsign || null,
            displayName: this.getPlayerDisplayName(player),
            cityId: Number.isFinite(player.city) ? Math.floor(player.city) : null,
            cityName: this.getCityDisplayName(player.city),
            isMayor: !!player.isMayor,
            isFake: !!player.isFake,
        };
        this.invokeNotifier(() => this.notifier.notifyPlayerLeft(payload));
    }

    invokeNotifier(callback) {
        if (typeof callback !== 'function') {
            return;
        }
        try {
            const result = callback();
            if (result && typeof result.then === 'function') {
                result.catch((error) => {
                    debug('Notifier error: %s', error && error.message ? error.message : error);
                });
            }
        } catch (error) {
            debug('Notifier error: %s', error && error.message ? error.message : error);
        }
    }

    getPlayerDisplayName(player) {
        if (!player) {
            return 'Unknown Player';
        }
        const callsign = typeof player.callsign === 'string' ? player.callsign.trim() : '';
        if (callsign.length) {
            return callsign;
        }
        const name = typeof player.name === 'string' ? player.name.trim() : '';
        if (name.length) {
            return name;
        }
        const shortened = shortenId(player.id);
        return shortened || 'Unknown Player';
    }

    getCityDisplayName(cityId) {
        const id = normaliseCityIdValue(cityId, null);
        if (id === null) {
            return null;
        }
        if (this.game && Array.isArray(this.game.cities) && this.game.cities[id]) {
            const city = this.game.cities[id];
            if (city.nameOverride && city.nameOverride.trim().length) {
                return city.nameOverride.trim();
            }
            if (city.name && city.name.trim().length) {
                return city.name.trim();
            }
        }
        if (this.citySpawns) {
            const spawn = this.citySpawns[String(id)];
            if (spawn && typeof spawn.name === 'string' && spawn.name.trim().length) {
                return spawn.name.trim();
            }
        }
        return `City ${id + 1}`;
    }

    getPlayerTeam(socketId) {
        const player = this.game.players[socketId];
        if (!player) {
            return null;
        }
        if (Number.isFinite(player.city)) {
            return player.city;
        }
        return null;
    }

    getPlayerCallsign(socketId) {
        if (!socketId && socketId !== 0) {
            return null;
        }
        const player = this.game.players[socketId];
        if (player && typeof player.callsign === 'string' && player.callsign.trim().length) {
            return player.callsign;
        }
        return this.callsigns.get(socketId);
    }

    getHumanPlayersInCity(cityId) {
        const id = normaliseCityIdValue(cityId, null);
        if (id === null) {
            return [];
        }
        const players = Object.values(this.game.players || {});
        return players.filter((player) => {
            if (!player || player.isSystemControlled) {
                return false;
            }
            return normaliseCityIdValue(player.city, null) === id;
        });
    }

    getScoringUserIdsForCity(cityId) {
        const participants = this.getHumanPlayersInCity(cityId);
        const ids = [];
        for (const player of participants) {
            if (!player || !player.userId) {
                continue;
            }
            const identifier = String(player.userId);
            if (!ids.includes(identifier)) {
                ids.push(identifier);
            }
        }
        return ids;
    }

    handleScoreServiceResult(result) {
        if (!result) {
            return;
        }
        if (Array.isArray(result.promotions)) {
            result.promotions.forEach((promotion) => this.announcePromotion(promotion));
        }
        if (result.changed) {
            this.emitLobbySnapshot();
        }
    }

    announcePromotion(promotion) {
        if (!promotion || !promotion.rankTitle) {
            return;
        }
        const displayName = (promotion.displayName && promotion.displayName.trim()) || 'A player';
        const message = `${displayName} has been promoted to ${promotion.rankTitle}!`;
        if (this.chatManager && typeof this.chatManager.broadcastSystemMessage === 'function') {
            this.chatManager.broadcastSystemMessage(message);
        } else if (this.io) {
            this.io.emit('score:promotion', JSON.stringify({
                name: displayName,
                rankTitle: promotion.rankTitle,
                userId: promotion.userId || null
            }));
        }
    }

    recordOrbVictoryForCity({ attackerCityId, points, orbPlayer }) {
        if (!this.scoreService) {
            return;
        }
        const cityId = normaliseCityIdValue(attackerCityId, null);
        if (cityId === null) {
            return;
        }
        const participantUserIds = this.getScoringUserIdsForCity(cityId);
        if (!participantUserIds.length) {
            return;
        }
        const orbHolderUserId = orbPlayer && orbPlayer.userId ? String(orbPlayer.userId) : null;
        const result = this.scoreService.recordOrbVictory({
            participantUserIds,
            orbHolderUserId,
            points
        });
        this.handleScoreServiceResult(result);
    }

    handleDeathScore(player, killSummary) {
        if (!this.scoreService || !player) {
            return;
        }
        const victimUserId = player.userId ? String(player.userId) : null;
        if (!victimUserId) {
            return;
        }
        const victimProfile = this.scoreService.getProfile(victimUserId);
        const applyPenalty = !!(victimProfile && Number(victimProfile.points) > 100);
        const victimCityId = normaliseCityIdValue(player.city, null);

        let killerCityId = null;
        if (killSummary) {
            killerCityId = normaliseCityIdValue(killSummary.killerCity, null);
            if (killerCityId === null) {
                killerCityId = normaliseCityIdValue(killSummary.teamId, null);
            }
        }

        let killerUserId = null;
        if (killSummary && killSummary.killerId) {
            const killerPlayer = this.game.players[killSummary.killerId];
            if (killerPlayer && killerPlayer.userId) {
                killerUserId = String(killerPlayer.userId);
            }
        }

        const shouldRewardOpponents = applyPenalty
            && killerCityId !== null
            && victimCityId !== null
            && killerCityId !== victimCityId;

        const killerUserIds = shouldRewardOpponents ? this.getScoringUserIdsForCity(killerCityId) : [];
        const result = this.scoreService.recordDeath({
            victimUserId,
            killerUserIds,
            killerUserId
        });
        this.handleScoreServiceResult(result);
    }

    describeKillOrigin(details) {
        if (!details) {
            return 'System Hazard';
        }
        if (details.killerCallsign) {
            return details.killerCallsign;
        }
        const sourceType = details.sourceType || null;
        let cityId = null;
        if (details && Number.isFinite(details.killerCity)) {
            cityId = Math.max(0, Math.floor(details.killerCity));
        } else if (details && Number.isFinite(details.teamId)) {
            cityId = Math.max(0, Math.floor(details.teamId));
        }
        const cityName = this.getCityDisplayName(cityId);

        if (sourceType) {
            switch (sourceType) {
                case 'turret':
                    return `${cityName || 'City'} Turret`;
                case 'plasma':
                case 'plasma_cannon':
                    return `${cityName || 'City'} Plasma Cannon`;
                case 'sleeper':
                    return `${cityName || 'City'} Sleeper Turret`;
                case 'rogue_tank':
                    return 'Rogue Tank';
                case 'fake_recruit':
                case 'city_recruit':
                    return `${cityName || 'City'} Recruit`;
                default:
                    break;
            }
        }
        const hazardType = details.hazardType || null;
        if (hazardType) {
            switch (hazardType) {
                case 'mine':
                    return `${cityName || 'City'} Mine`;
                case 'bomb':
                    return `${cityName || 'City'} Bomb`;
                case 'dfg':
                case 'dfg_field':
                    return `${cityName || 'City'} DFG Field`;
                default:
                    break;
            }
        }
        return 'System Hazard';
    }

    resolveKillSummary(player, meta) {
        const summary = {
            killerId: null,
            killerCallsign: null,
            killerCity: null,
            sourceType: null,
            hazardType: null,
            teamId: null
        };
        if (!meta || typeof meta !== 'object') {
            summary.killerLabel = this.describeKillOrigin(summary);
            return summary;
        }
        const candidateKeys = ['sourceId', 'shooterId', 'emitterId', 'ownerId'];
        for (let i = 0; i < candidateKeys.length; i += 1) {
            const key = candidateKeys[i];
            const candidate = meta[key];
            if (!candidate && candidate !== 0) {
                continue;
            }
            const candidateId = String(candidate);
            if (player && player.id && candidateId === player.id) {
                continue;
            }
            summary.killerId = candidateId;
            summary.killerCallsign = this.getPlayerCallsign(candidateId);
            const killer = this.game.players[candidateId];
            if (killer && Number.isFinite(killer.city)) {
                summary.killerCity = Math.floor(killer.city);
            }
            break;
        }
        if (meta.sourceType) {
            summary.sourceType = String(meta.sourceType).toLowerCase();
        }
        if (meta.type) {
            summary.hazardType = String(meta.type).toLowerCase();
        }
        if (summary.teamId === null && summary.killerCity !== null) {
            summary.teamId = Math.max(0, Math.floor(summary.killerCity));
        }
        if (meta.teamId !== undefined && meta.teamId !== null) {
            const teamNumeric = Number(meta.teamId);
            if (Number.isFinite(teamNumeric)) {
                summary.teamId = Math.max(0, Math.floor(teamNumeric));
            }
        }
        if (summary.killerCity === null && summary.teamId !== null) {
            summary.killerCity = summary.teamId;
        }
        summary.killerLabel = this.describeKillOrigin(summary);
        return summary;
    }

    getPlayer(socketId) {
        if (!socketId) {
            return null;
        }
        return this.game.players[socketId] || null;
    }

    adjustCityInventory(socketId, itemType, delta) {
        if (!this.game || !this.game.buildingFactory || !this.game.buildingFactory.cityManager) {
            return 0;
        }
        if (!Number.isFinite(delta) || delta === 0) {
            return 0;
        }
        const player = this.game.players[socketId];
        if (!player || player.city === undefined || player.city === null) {
            return 0;
        }
        const cityId = Number(player.city);
        if (!Number.isFinite(cityId)) {
            return 0;
        }
        const cityManager = this.game.buildingFactory.cityManager;
        if (delta > 0) {
            return cityManager.recordInventoryPickup(socketId, cityId, itemType, delta);
        }
        return cityManager.recordInventoryConsumption(socketId, cityId, itemType, Math.abs(delta));
    }

    getSocket(socketId) {
        const sockets = this.io && this.io.sockets && this.io.sockets.sockets;
        if (!sockets) {
            return null;
        }
        if (typeof sockets.get === 'function') {
            return sockets.get(socketId) || null;
        }
        if (typeof sockets[socketId] !== 'undefined') {
            return sockets[socketId];
        }
        return null;
    }

    createSystemPlayer(data, options = {}) {
        if (!data || !data.id) {
            return null;
        }
        const id = String(data.id);
        if (!id.length) {
            return null;
        }
        if (this.game.players[id]) {
            const existing = this.game.players[id];
            if (!existing.callsign) {
                existing.callsign = this.callsigns.assign(id, { category: options.isFakeRecruit ? 'recruit' : 'npc' });
            }
            return existing;
        }
        const payload = Object.assign({}, data, {
            id,
            city: Number.isFinite(data.city) ? data.city : (options.city ?? 0),
            isMayor: false
        });
        const now = Date.now();
        const player = new Player(id, payload, now);
        const healthOverride = Number.isFinite(data.health) ? data.health : options.health;
        if (Number.isFinite(healthOverride)) {
            player.health = Math.max(0, Math.floor(healthOverride));
        }
        player.isSystemControlled = true;
        if (options.isFake !== undefined) {
            player.isFake = !!options.isFake;
        } else if (data.isFake !== undefined) {
            player.isFake = !!data.isFake;
        }
        if (options.isFakeRecruit !== undefined) {
            player.isFakeRecruit = !!options.isFakeRecruit;
        } else if (data.isFakeRecruit !== undefined) {
            player.isFakeRecruit = !!data.isFakeRecruit;
        }
        if (options.type || data.type) {
            player.type = options.type || data.type;
        }
        if (options.ownerId || data.ownerId) {
            player.ownerId = options.ownerId || data.ownerId;
        }
        if (options.maxHealth !== undefined && Number.isFinite(options.maxHealth)) {
            player.maxHealth = Math.max(1, Math.floor(options.maxHealth));
        }
        if (options.sequence !== undefined && Number.isFinite(options.sequence)) {
            player.sequence = Math.max(0, Math.floor(options.sequence));
        }
        player.callsign = this.callsigns.assign(id, { category: options.isFakeRecruit ? 'recruit' : 'npc' });
        this.game.players[id] = player;
        if (options.broadcast !== false && this.io) {
            this.io.emit('player', JSON.stringify(player));
        }
        return player;
    }

    removeSystemPlayer(id, options = {}) {
        if (!id && id !== 0) {
            return false;
        }
        const key = String(id);
        const player = this.game.players[key];
        if (!player || !player.isSystemControlled) {
            return false;
        }
        delete this.game.players[key];
        this.callsigns.release(key);
        if (options.broadcast !== false && this.io) {
            this.io.emit('player:removed', JSON.stringify({ id: player.id }));
        }
        return true;
    }

    evictCityPlayers(cityId, options = {}) {
        const numericCity = Number(cityId);
        if (!Number.isFinite(numericCity)) {
            return 0;
        }

        const toEvict = [];
        Object.entries(this.game.players).forEach(([socketId, player]) => {
            if (!player) {
                return;
            }
            const playerCity = Number(player.city);
            if (!Number.isFinite(playerCity) || playerCity !== numericCity) {
                return;
            }
            toEvict.push({ socketId, player });
        });

        if (!toEvict.length) {
            return 0;
        }

        const reason = options.reason || 'orb';
        const attackerCity = options.attackerCity ?? null;
        const points = options.points ?? null;

        toEvict.forEach(({ socketId, player }) => {
            const socket = (this.io && this.io.sockets && this.io.sockets.sockets)
                ? this.io.sockets.sockets.get(socketId)
                : null;

            if (socket) {
                socket.emit('lobby:evicted', JSON.stringify({
                    city: numericCity,
                    reason,
                    attackerCity,
                    points
                }));
            }

            if (this.game.buildingFactory && this.game.buildingFactory.cityManager) {
                this.game.buildingFactory.cityManager.releasePlayerInventory(socketId);
            }
            this.releaseSlot(player);
            delete this.game.players[socketId];
            if (this.io) {
                this.io.emit('player:removed', JSON.stringify({ id: player.id }));
            }
        });

        return toEvict.length;
    }

    applyDamage(socketId, amount, meta) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }

        if (player.isCloaked) {
            this.clearCloak(socketId);
        }

        const previousHealth = player.health;
        player.health = Math.max(0, previousHealth - Math.floor(amount));

        const payload = {
            id: player.id,
            health: player.health,
            previousHealth: previousHealth,
            source: meta || null
        };

        if (this.io) {
            this.io.emit('player:health', JSON.stringify(payload));
        }

        if (player.health <= 0) {
            this.handlePlayerDeath(socketId, player, meta);
        }
    }

    handleItemUse(socket, payload) {
        if (!socket) {
            return;
        }
        const data = this.safeParse(payload);
        if (!data) {
            return;
        }
        const typeRaw = data.type;
        const type = (typeof typeRaw === 'string') ? typeRaw.trim().toLowerCase() : typeRaw;
        if (!type) {
            return;
        }
        const socketId = socket.id;
        if (!this.game.players[socketId]) {
            return;
        }

        switch (type) {
            case 'medkit':
                if (this.applyHealing(socketId, MAX_HEALTH, { type: 'medkit', iconId: data.iconId ?? null })) {
                    this.adjustCityInventory(socketId, ITEM_TYPES.MEDKIT, -1);
                }
                break;
            case 'cloak':
                if (this.applyCloak(socketId, Number.isFinite(data.duration) ? data.duration : TIMER_CLOAK)) {
                    this.adjustCityInventory(socketId, ITEM_TYPES.CLOAK, -1);
                }
                break;
            default:
                break;
        }
    }

    applyHealing(socketId, targetHealth, meta) {
        const player = this.game.players[socketId];
        if (!player) {
            return false;
        }
        const previousHealth = player.health;
        const resolvedHealth = Number.isFinite(targetHealth) ? targetHealth : MAX_HEALTH;
        const clamped = Math.min(MAX_HEALTH, Math.max(previousHealth, Math.floor(resolvedHealth)));
        if (clamped <= previousHealth) {
            return false;
        }
        player.health = clamped;
        if (this.io) {
            this.io.emit('player:health', JSON.stringify({
                id: player.id,
                health: player.health,
                previousHealth,
                source: meta || null
            }));
        }
        return true;
    }

    applyCloak(socketId, durationMs = TIMER_CLOAK) {
        const player = this.game.players[socketId];
        if (!player) {
            return false;
        }
        const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : TIMER_CLOAK;
        player.isCloaked = true;
        player.cloakExpiresAt = Date.now() + duration;
        this.emitStatusUpdate(player);
        return true;
    }

    clearCloak(socketId) {
        const player = this.game.players[socketId];
        if (!player || !player.isCloaked) {
            return;
        }
        player.isCloaked = false;
        player.cloakExpiresAt = 0;
        this.emitStatusUpdate(player);
    }

    applyFreeze(socketId, durationMs = TIMER_DFG, options = {}) {
        const player = this.game.players[socketId];
        if (!player) {
            return;
        }
        const duration = Number.isFinite(durationMs) ? Math.max(0, durationMs) : TIMER_DFG;
        player.isFrozen = true;
        player.frozenUntil = Date.now() + duration;
        player.frozenBy = options.source ?? null;
        this.emitStatusUpdate(player);
    }

    emitStatusUpdate(player, extra = {}) {
        if (!player || !this.io) {
            return;
        }
        const payload = Object.assign({
            id: player.id,
            isCloaked: !!player.isCloaked,
            cloakExpiresAt: player.cloakExpiresAt || 0,
            isFrozen: !!player.isFrozen,
            frozenUntil: player.frozenUntil || 0,
            frozenBy: player.frozenBy || null
        }, extra || {});
        this.io.emit('player:status', JSON.stringify(payload));
    }

    handlePlayerDeath(socketId, player, meta) {
        debug("Player " + socketId + " eliminated by " + JSON.stringify(meta));
        this.clearCloak(socketId);
        if (player.isFrozen) {
            player.isFrozen = false;
            player.frozenUntil = 0;
            player.frozenBy = null;
            this.emitStatusUpdate(player);
        }
        const killSummary = this.resolveKillSummary(player, meta);
        this.handleDeathScore(player, killSummary);
        const victimCallsign = player.callsign || this.getPlayerCallsign(player.id);
        if (this.io) {
            this.io.emit('player:dead', JSON.stringify({
                id: player.id,
                callsign: victimCallsign || null,
                reason: meta || null,
                killerId: killSummary.killerId,
                killerCallsign: killSummary.killerCallsign,
                killerLabel: killSummary.killerLabel,
                killerCity: killSummary.killerCity,
                teamId: killSummary.teamId ?? null,
                sourceType: killSummary.sourceType,
                hazardType: killSummary.hazardType
            }));
        }

        const socket = this.getSocket(socketId);
        let attackerCity = killSummary.killerCity ?? null;
        if (attackerCity === null && meta && typeof meta === 'object') {
            const metaTeam = Number(meta.teamId);
            if (Number.isFinite(metaTeam)) {
                attackerCity = Math.floor(metaTeam);
            }
        }
        const playerCityNumeric = Number(player.city);
        const playerCityId = Number.isFinite(playerCityNumeric) ? Math.floor(playerCityNumeric) : null;

        if (!player.isSystemControlled) {
            this.releaseSlot(player);
        }
        if (this.game.buildingFactory && this.game.buildingFactory.cityManager) {
            this.game.buildingFactory.cityManager.releasePlayerInventory(socketId);
        }
        delete this.game.players[socketId];

        if (this.io) {
            this.io.emit('player:removed', JSON.stringify({ id: player.id }));
        }

        if (socket && !player.isSystemControlled) {
            socket.emit('lobby:evicted', JSON.stringify({
                city: playerCityId,
                reason: 'death',
                attackerCity,
                points: null
            }));
        }
    }

    resolveIdentityFromPayload(payload) {
        if (!this.userStore || typeof this.userStore.get !== 'function') {
            return null;
        }
        if (!payload || typeof payload !== 'object') {
            return null;
        }
        const identity = payload.identity && typeof payload.identity === 'object'
            ? payload.identity
            : null;
        const candidate = identity && identity.id
            ? identity.id
            : (payload.userId || payload.identityId || null);
        if (!candidate || (typeof candidate !== 'string' && typeof candidate !== 'number')) {
            return null;
        }
        return this.userStore.get(String(candidate));
    }

    applyIdentityToPlayer(player, identity) {
        if (!player) {
            return;
        }
        this.callsigns.release(player.id);
        if (identity) {
            player.userId = identity.id;
            player.callsign = identity.name;
            if (this.scoreService && typeof this.scoreService.syncIdentity === 'function') {
                this.scoreService.syncIdentity(identity);
            }
        } else {
            player.userId = null;
            player.callsign = this.callsigns.assign(player.id, { category: 'human' });
        }
    }

    safeParse(payload) {
        if (!payload) {
            return {};
        }
        if (typeof payload !== 'string') {
            return payload;
        }
        try {
            return JSON.parse(payload);
        } catch (error) {
            debug("Failed to parse incoming player payload: " + error.message);
            return {};
        }
    }

    serializePlayers(excludeId) {
        var players = [];
        Object.keys(this.game.players).forEach((id) => {
            if (excludeId && id === excludeId) {
                return;
            }
            var player = this.game.players[id];
            if (player) {
                players.push(player);
            }
        });
        return players;
    }

    cycle(now = Date.now()) {
        const players = this.game.players || {};
        for (const playerId in players) {
            if (!Object.prototype.hasOwnProperty.call(players, playerId)) {
                continue;
            }
            const player = players[playerId];
            if (!player) {
                continue;
            }
            let statusChanged = false;
            if (player.isCloaked && player.cloakExpiresAt && now >= player.cloakExpiresAt) {
                player.isCloaked = false;
                player.cloakExpiresAt = 0;
                statusChanged = true;
            }
            if (player.isFrozen && player.frozenUntil && now >= player.frozenUntil) {
                player.isFrozen = false;
                player.frozenUntil = 0;
                player.frozenBy = null;
                statusChanged = true;
            }
            if (statusChanged) {
                this.emitStatusUpdate(player);
            }

            this.applyHospitalHealingForPlayer(player, now);
        }
    }

    applyHospitalHealingForPlayer(player, now = Date.now()) {
        if (!player || player.health <= 0) {
            return false;
        }
        if (!this.game || !this.game.buildingFactory) {
            return false;
        }
        if (!Number.isFinite(player.health) || player.health >= MAX_HEALTH) {
            return false;
        }
        const factory = this.game.buildingFactory;
        const buildings = factory && factory.buildings;
        if (!buildings || typeof buildings.values !== 'function') {
            return false;
        }

        const playerRect = getPlayerRect(player);
        const referenceTime = Number.isFinite(now) ? now : Date.now();

        for (const building of buildings.values()) {
            if (!building || !isHospitalBuilding(building)) {
                continue;
            }
            const healZone = getHospitalDriveableRect(building);
            if (!healZone) {
                continue;
            }
            if (!rectangleCollision(playerRect, healZone)) {
                continue;
            }
            const lastHeal = Number.isFinite(player.lastHospitalHealAt) ? player.lastHospitalHealAt : 0;
            if (referenceTime < (lastHeal + HOSPITAL_HEAL_INTERVAL)) {
                return false;
            }

            const previousHealth = player.health;
            const nextHealth = Math.min(MAX_HEALTH, previousHealth + HOSPITAL_HEAL_AMOUNT);
            if (nextHealth <= previousHealth) {
                return false;
            }

            player.health = nextHealth;
            player.lastHospitalHealAt = referenceTime;

            if (this.io) {
                this.io.emit('player:health', JSON.stringify({
                    id: player.id,
                    health: player.health,
                    previousHealth,
                    source: {
                        type: 'hospital',
                        buildingId: building.id || null,
                    }
                }));
            }

            return true;
        }

        return false;
    }

    getSpawnForCity(cityId) {
        const numeric = Number(cityId);
        const computeFallbackSpawn = (name) => {
            if (!Number.isFinite(numeric)) {
                return {
                    x: HALF_TILE,
                    y: HALF_TILE,
                    name: name || null
                };
            }
            const tileX = 479 - ((numeric % 8) * 64);
            const tileY = 479 - (Math.floor(numeric / 8) * 64);
            const baseX = tileX * TILE_SIZE;
            const baseY = tileY * TILE_SIZE;
            const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
            const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
            return {
                x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
                y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y,
                name: name || null
            };
        };

        if (!Number.isFinite(numeric)) {
            return computeFallbackSpawn(null);
        }

        const key = String(Math.max(0, Math.floor(numeric)));
        const entry = this.citySpawns && this.citySpawns[key];
        if (entry && typeof entry === 'object') {
            const pixelX = Number(entry.pixelX);
            const pixelY = Number(entry.pixelY);
            const tileX = Number(entry.tileX);
            const tileY = Number(entry.tileY);
            const hasPixelX = Number.isFinite(pixelX);
            const hasPixelY = Number.isFinite(pixelY);
            const hasTileX = Number.isFinite(tileX);
            const hasTileY = Number.isFinite(tileY);

            if (hasPixelX && hasPixelY) {
                return {
                    x: pixelX,
                    y: pixelY,
                    name: entry.name || null
                };
            }

            if (hasTileX && hasTileY) {
                const baseX = tileX * TILE_SIZE;
                const baseY = tileY * TILE_SIZE;
                const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
                const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
                return {
                    x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
                    y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y,
                    name: entry.name || null
                };
            }

            return computeFallbackSpawn(entry.name || null);
        }

        return computeFallbackSpawn(null);
    }

    extractAssignmentPreferences(payload) {
        if (!payload || typeof payload !== 'object') {
            return { city: null, role: null, requested: false };
        }

        const citySources = [
            payload.requestedCity,
            payload.desiredCity,
            payload.cityPreference,
            payload.cityId,
            payload.city
        ];

        if (payload.assignment && typeof payload.assignment === 'object') {
            citySources.push(payload.assignment.cityId);
            citySources.push(payload.assignment.city);
        }

        let city = null;
        for (const source of citySources) {
            const id = normaliseCityIdValue(source, null);
            if (Number.isFinite(id)) {
                city = id;
                break;
            }
        }

        const roleSources = [
            payload.requestedRole,
            payload.desiredRole,
            payload.role
        ];

        if (payload.assignment && typeof payload.assignment === 'object') {
            roleSources.push(payload.assignment.role);
        }

        let role = null;
        for (const source of roleSources) {
            const normalised = normaliseRoleValue(source);
            if (normalised) {
                role = normalised;
                break;
            }
        }

        const requested = (city !== null && city !== undefined) || (role && role !== 'auto');
        return {
            city: city !== null ? city : null,
            role,
            requested
        };
    }

    assignCityAndRole(socketId, preferences) {
        const prefs = preferences || { city: null, role: null, requested: false };
        const cityIds = this.getCityCandidates();
        if (!cityIds.length) {
            return { city: 0, isMayor: false, overflow: true, source: 'auto' };
        }

        const requested = this.resolveRequestedAssignment(prefs, cityIds);
        if (requested) {
            requested.overflow = false;
            requested.source = prefs.requested ? 'requested' : 'auto';
            return requested;
        }

        const assignment = this.assignCityAndRoleAuto(cityIds);
        assignment.source = prefs.requested ? 'fallback' : 'auto';
        return assignment;
    }

    assignCityAndRoleAuto(cityIds) {
        const ids = Array.isArray(cityIds) && cityIds.length ? cityIds : this.getCityCandidates();
        if (!ids.length) {
            return { city: 0, isMayor: false, overflow: true, source: 'auto' };
        }

        const totalCities = ids.length;
        const startIndex = this.cityCursor % totalCities;

        for (let offset = 0; offset < totalCities; offset += 1) {
            const index = (startIndex + offset) % totalCities;
            const cityId = ids[index];
            const state = this.computeCityState(cityId);

            if (state && state.openMayor) {
                this.updateCityCursor(ids, cityId);
                return { city: cityId, isMayor: true, overflow: false };
            }

            if (state && state.openRecruits > 0) {
                this.updateCityCursor(ids, cityId);
                return { city: cityId, isMayor: false, overflow: false };
            }
        }

        const overflowCity = ids[startIndex];
        this.updateCityCursor(ids, overflowCity);
        return { city: overflowCity, isMayor: false, overflow: true };
    }

    resolveRequestedAssignment(preferences, cityIds) {
        if (!preferences) {
            return null;
        }
        const cityId = normaliseCityIdValue(preferences.city, null);
        if (cityId === null || cityId === undefined) {
            return null;
        }
        const ids = Array.isArray(cityIds) ? cityIds : this.getCityCandidates();
        if (!ids.includes(cityId)) {
            return null;
        }
        const state = this.computeCityState(cityId);
        if (!state) {
            return null;
        }

        const desiredRole = normaliseRoleValue(preferences.role);

        if (desiredRole === 'mayor') {
            if (!state.openMayor) {
                return null;
            }
            this.updateCityCursor(ids, cityId);
            return { city: cityId, isMayor: true };
        }

        if (desiredRole === 'recruit') {
            if (state.openRecruits <= 0) {
                return null;
            }
            this.updateCityCursor(ids, cityId);
            return { city: cityId, isMayor: false };
        }

        if (!state.openMayor && state.openRecruits <= 0) {
            return null;
        }

        const assignMayor = state.openMayor;
        this.updateCityCursor(ids, cityId);
        return { city: cityId, isMayor: assignMayor };
    }

    updateCityCursor(cityIds, selectedCityId) {
        const ids = Array.isArray(cityIds) ? cityIds : this.getCityCandidates();
        if (!ids.length) {
            return;
        }
        const index = ids.indexOf(selectedCityId);
        if (index === -1) {
            return;
        }
        this.cityCursor = (index + 1) % ids.length;
    }

    getCityCandidates() {
        const candidates = new Set(this.defaultCityPool);
        const cityList = this.game && Array.isArray(this.game.cities) ? this.game.cities : null;

        if (cityList) {
            for (let index = 0; index < cityList.length; index += 1) {
                const entry = cityList[index];
                if (!entry && entry !== 0) {
                    continue;
                }
                if (entry && entry.isFake) {
                    continue;
                }
                const id = Number.isFinite(entry?.id) ? entry.id : index;
                candidates.add(id);
            }
        }

        if (!candidates.size) {
            return this.defaultCityPool.slice();
        }

        const sorted = Array.from(candidates).sort((a, b) => a - b);
        return sorted;
    }

    ensureCityRoster(cityId) {
        const id = Number.isFinite(cityId) ? cityId : 0;
        if (!this.cityRosters.has(id)) {
            this.cityRosters.set(id, {
                mayor: null,
                recruits: []
            });
        }
        return this.cityRosters.get(id);
    }

    computeCityState(cityId) {
        const id = normaliseCityIdValue(cityId, null);
        if (id === null || id === undefined) {
            return null;
        }
        const roster = this.ensureCityRoster(id);
        const players = Object.values(this.game.players || {}).filter((player) => normaliseCityIdValue(player && player.city, null) === id);
        const mayorPlayer = players.find((player) => player && player.isMayor);
        const mayorIdCandidate = mayorPlayer ? mayorPlayer.id : (roster.mayor || null);
        const mayorEntity = mayorPlayer || (mayorIdCandidate && this.game.players ? this.game.players[mayorIdCandidate] : null);
        const mayorId = mayorEntity ? mayorEntity.id : mayorIdCandidate;
        const mayorName = mayorEntity ? (mayorEntity.callsign || null) : null;
        const hasMayor = !!mayorId;
        const playerCount = players.length;
        const cityState = this.game.cities ? this.game.cities[id] : null;
        const isFake = !!(cityState && cityState.isFake);
        const rawMayorSlots = cityState ? toFiniteNumber(cityState.fakeBotMayorSlots, null) : null;
        const rawRecruitCapacity = cityState ? toFiniteNumber(cityState.fakeBotRecruitCapacity, null) : null;
        const fakeMayorSlots = Number.isFinite(rawMayorSlots) ? Math.max(0, Math.floor(rawMayorSlots)) : 0;
        const fakeRecruitCapacity = Number.isFinite(rawRecruitCapacity)
            ? Math.max(0, Math.floor(rawRecruitCapacity))
            : 0;
        let capacity = 1 + this.maxRecruitsPerCity;
        if (isFake) {
            const desiredCapacity = fakeMayorSlots + fakeRecruitCapacity;
            capacity = Math.max(1, desiredCapacity);
        }
        let openMayor = !hasMayor;
        if (isFake) {
            openMayor = fakeMayorSlots > 0 && !hasMayor;
        }
        const recruitCount = hasMayor ? Math.max(0, playerCount - 1) : playerCount;
        let openRecruits = Math.max(0, capacity - playerCount);
        if (isFake) {
            openRecruits = Math.max(0, fakeRecruitCapacity - recruitCount);
        }
        return {
            cityId: id,
            roster,
            players,
            mayorId,
            mayorName,
            playerCount,
            recruitCount,
            openMayor,
            openRecruits,
            capacity,
            isFake
        };
    }

    buildLobbyEntry(cityId) {
        const state = this.computeCityState(cityId);
        if (!state) {
            return null;
        }
        const spawn = this.citySpawns && this.citySpawns[String(state.cityId)];
        const cityState = this.game.cities ? this.game.cities[state.cityId] : null;
        const displayName = (cityState && (cityState.nameOverride || cityState.name))
            || (spawn && spawn.name)
            || `City ${state.cityId + 1}`;
        return {
            id: state.cityId,
            name: displayName,
            mayorId: state.mayorId || null,
            mayorName: state.mayorName || null,
            mayorLabel: shortenId(state.mayorId || null),
            playerCount: state.playerCount,
            recruitCount: state.recruitCount,
            capacity: state.capacity,
            openMayor: state.openMayor,
            openRecruits: state.openRecruits,
            hasRecruitVacancy: state.openRecruits > 0,
            maxRecruits: this.maxRecruitsPerCity,
            score: (() => {
                const city = this.game.cities ? this.game.cities[state.cityId] : null;
                return city ? Number(city.score) || 0 : 0;
            })(),
            orbs: (() => {
                const city = this.game.cities ? this.game.cities[state.cityId] : null;
                return city ? Number(city.orbs) || 0 : 0;
            })()
        };
    }

    buildLobbySnapshot() {
        const cityIds = this.getCityCandidates();
        const entries = cityIds.map((id) => this.buildLobbyEntry(id)).filter((entry) => !!entry);
        const highScores = this.scoreService && typeof this.scoreService.getHighScores === 'function'
            ? this.scoreService.getHighScores(20)
            : [];
        return {
            cities: entries,
            maxRecruitsPerCity: this.maxRecruitsPerCity,
            updatedAt: Date.now(),
            highScores
        };
    }

    emitLobbySnapshot(targetSocket) {
        const snapshot = this.buildLobbySnapshot();
        this.lobbyVersion += 1;
        snapshot.version = this.lobbyVersion;
        if (targetSocket) {
            targetSocket.emit('lobby:snapshot', JSON.stringify(snapshot));
            return;
        }
        if (this.io) {
            this.io.emit('lobby:update', JSON.stringify(snapshot));
        }
    }

    registerAssignment(player, assignment) {
        if (!player) {
            return;
        }
        const roster = this.ensureCityRoster(player.city);
        const state = this.computeCityState(player.city);
        const existingMayorId = (state && state.mayorId && state.mayorId !== player.id)
            ? state.mayorId
            : null;

        let finalIsMayor = !!assignment.isMayor;
        if (finalIsMayor && existingMayorId) {
            debug(`City ${player.city} already has mayor ${existingMayorId}; converting ${player.id} to recruit`);
            finalIsMayor = false;
            assignment.isMayor = false;
        }

        player.isMayor = finalIsMayor;

        if (finalIsMayor) {
            roster.mayor = player.id;
            roster.recruits = roster.recruits.filter((id) => id !== player.id);
        } else {
            if (roster.mayor === player.id) {
                roster.mayor = null;
            }
            if (!assignment.overflow && !roster.recruits.includes(player.id)) {
                roster.recruits.push(player.id);
            }
        }

        this.emitLobbySnapshot();
    }

    releaseSlot(player) {
        if (!player) {
            return;
        }
        if (player.isSystemControlled) {
            return;
        }

        const roster = this.cityRosters.get(player.city);
        if (!roster) {
            return;
        }

        if (roster.mayor === player.id) {
            roster.mayor = null;
            const promotedId = roster.recruits.shift();
            if (promotedId) {
                roster.mayor = promotedId;
                const promotedPlayer = this.game.players[promotedId];
                if (promotedPlayer) {
                    promotedPlayer.isMayor = true;
                    if (this.io) {
                        this.io.emit('player', JSON.stringify(promotedPlayer));
                    }
                }
            }
        } else {
            roster.recruits = roster.recruits.filter((id) => id !== player.id);
        }
        this.emitLobbySnapshot();
    }
}


module.exports = PlayerFactory;
