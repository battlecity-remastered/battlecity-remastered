"use strict";

const citySpawns = require('../../../shared/citySpawns.json');
const debug = require('debug')('BattleCity:OrbManager');
const {
    TILE_SIZE,
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES,
} = require('../gameplay/constants');

const ORB_RESULT_EVENT = 'orb:result';
const CITY_ORBED_EVENT = 'city:orbed';

const toNumber = (value, fallback = null) => {
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

class OrbManager {
    constructor({ game, cityManager, playerFactory, buildingFactory, hazardManager, defenseManager, iconDropManager = null, notifier = null }) {
        this.game = game;
        this.cityManager = cityManager;
        this.playerFactory = playerFactory;
        this.buildingFactory = buildingFactory;
        this.hazardManager = hazardManager;
        this.defenseManager = defenseManager;
        this.iconDropManager = iconDropManager;
        this.io = null;
        this.notifier = notifier || null;
    }

    setIo(io) {
        this.io = io;
    }

    setNotifier(notifier) {
        this.notifier = notifier || null;
    }

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch (_error) {
                return null;
            }
        }
        if (typeof payload === 'object') {
            return payload;
        }
        return null;
    }

    handleDrop(socket, payload) {
        if (!socket) {
            return;
        }
        const data = this.parsePayload(payload);
        if (!data) {
            this.emitDropResult(socket, { status: 'rejected', reason: 'invalid_payload' });
            return;
        }

        const player = this.getPlayer(socket.id);
        if (!player) {
            this.emitDropResult(socket, { status: 'rejected', reason: 'unknown_player' });
            return;
        }
        const playerCity = toNumber(player.city, null);
        if (!Number.isFinite(playerCity)) {
            this.emitDropResult(socket, { status: 'rejected', reason: 'no_city' });
            return;
        }

        const dropX = toNumber(data.x, null);
        const dropY = toNumber(data.y, null);
        if (!Number.isFinite(dropX) || !Number.isFinite(dropY)) {
            this.emitDropResult(socket, { status: 'rejected', reason: 'bad_coordinates' });
            return;
        }

        const targetCity = this.resolveTargetCity(dropX, dropY, playerCity);
        if (!Number.isFinite(targetCity)) {
            this.emitDropResult(socket, { status: 'idle', reason: 'no_target' });
            return;
        }

        if (!this.cityManager || !this.cityManager.isOrbable(targetCity)) {
            this.emitDropResult(socket, { status: 'idle', reason: 'not_orbable', targetCity });
            return;
        }

        const points = this.cityManager.calculateOrbValue(targetCity);

        if (this.buildingFactory) {
            this.buildingFactory.destroyCity(targetCity);
        }

        if (this.hazardManager) {
            this.hazardManager.removeHazardsForTeam(targetCity, 'city_destroyed');
        }

        if (this.defenseManager && typeof this.defenseManager.clearCity === 'function') {
            this.defenseManager.clearCity(targetCity);
        }

        if (this.cityManager) {
            this.cityManager.resetCity(targetCity);
            if (this.iconDropManager && typeof this.iconDropManager.clearCity === 'function') {
                this.iconDropManager.clearCity(targetCity);
            }
            this.cityManager.recordOrbVictory(playerCity, points);
            if (typeof this.cityManager.releaseOrbHolder === 'function') {
                this.cityManager.releaseOrbHolder(socket.id, { consume: true });
            } else if (typeof this.cityManager.consumeOrb === 'function') {
                this.cityManager.consumeOrb(playerCity, socket.id);
            }
        }

        if (this.playerFactory && typeof this.playerFactory.recordOrbVictoryForCity === 'function') {
            this.playerFactory.recordOrbVictoryForCity({
                attackerCityId: playerCity,
                points,
                orbPlayer: player
            });
        }

        if (this.playerFactory && typeof this.playerFactory.evictCityPlayers === 'function') {
            this.playerFactory.evictCityPlayers(targetCity, {
                reason: 'orb',
                attackerCity: playerCity,
                points
            });
        }

        const broadcastPayload = {
            attackerCity: playerCity,
            targetCity,
            points,
            drop: {
                x: dropX,
                y: dropY
            },
            attackerId: player.id
        };

        if (this.io) {
            this.io.emit(CITY_ORBED_EVENT, broadcastPayload);
        }

        this.notifyOrbDetonated({
            attackerCity: playerCity,
            attackerCityName: this.describeCity(playerCity),
            attackerId: player.id,
            attackerCallsign: player.callsign || null,
            attackerDisplayName: this.describePlayer(player),
            targetCity,
            targetCityName: this.describeCity(targetCity),
            points
        });

        this.emitDropResult(socket, {
            status: 'detonated',
            targetCity,
            points
        });
    }

    emitDropResult(socket, payload) {
        if (!socket) {
            return;
        }
        socket.emit(ORB_RESULT_EVENT, payload);
    }

    notifyOrbDetonated(payload) {
        if (!payload || !this.notifier || typeof this.notifier.notifyOrbDetonated !== 'function') {
            return;
        }
        this.invokeNotifier(() => this.notifier.notifyOrbDetonated(payload));
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

    describeCity(cityId) {
        if (this.playerFactory && typeof this.playerFactory.getCityDisplayName === 'function') {
            return this.playerFactory.getCityDisplayName(cityId);
        }
        if (Number.isFinite(cityId)) {
            return `City ${Math.floor(cityId) + 1}`;
        }
        return null;
    }

    describePlayer(player) {
        if (this.playerFactory && typeof this.playerFactory.getPlayerDisplayName === 'function') {
            return this.playerFactory.getPlayerDisplayName(player);
        }
        if (!player) {
            return 'Unknown Player';
        }
        if (typeof player.callsign === 'string' && player.callsign.trim().length) {
            return player.callsign.trim();
        }
        if (typeof player.id === 'string' && player.id.length) {
            if (player.id.length <= 8) {
                return player.id;
            }
            return `${player.id.slice(0, 4)}...${player.id.slice(-2)}`;
        }
        return 'Unknown Player';
    }

    getPlayer(socketId) {
        if (!this.playerFactory || typeof this.playerFactory.getPlayer !== 'function') {
            return null;
        }
        return this.playerFactory.getPlayer(socketId);
    }

    resolveTargetCity(dropX, dropY, excludeCityId) {
        const centerX = dropX + (TILE_SIZE / 2);
        const centerY = dropY + (TILE_SIZE / 2);
        let bestMatch = null;
        let bestDistance = Infinity;

        Object.keys(citySpawns || {}).forEach((key) => {
            const numericId = Number(key);
            if (!Number.isFinite(numericId)) {
                return;
            }
            if (Number.isFinite(excludeCityId) && numericId === excludeCityId) {
                return;
            }
            const rect = this.getCommandCenterRect(numericId);
            if (!rect) {
                return;
            }
            const margin = TILE_SIZE * 0.75;
            const expanded = {
                x: rect.x - margin,
                y: rect.y - margin,
                width: rect.width + (margin * 2),
                height: rect.height + (margin * 2),
            };
            if (!this.pointWithinRect(centerX, centerY, expanded)) {
                return;
            }
            const clampedX = Math.max(rect.x, Math.min(centerX, rect.x + rect.width));
            const clampedY = Math.max(rect.y, Math.min(centerY, rect.y + rect.height));
            const dx = centerX - clampedX;
            const dy = centerY - clampedY;
            const distance = (dx * dx) + (dy * dy);
            if (distance < bestDistance) {
                bestDistance = distance;
                bestMatch = numericId;
            }
        });

        return bestMatch;
    }

    getCommandCenterRect(cityId) {
        const entry = citySpawns?.[String(cityId)];
        if (!entry) {
            return null;
        }
        const tileX = toNumber(entry.tileX, null);
        const tileY = toNumber(entry.tileY, null);
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return null;
        }
        return {
            x: tileX * TILE_SIZE,
            y: tileY * TILE_SIZE,
            width: COMMAND_CENTER_WIDTH_TILES * TILE_SIZE,
            height: COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE,
        };
    }

    pointWithinRect(x, y, rect) {
        return x >= rect.x &&
            x <= rect.x + rect.width &&
            y >= rect.y &&
            y <= rect.y + rect.height;
    }
}

module.exports = OrbManager;
