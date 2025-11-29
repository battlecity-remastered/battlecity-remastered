"use strict";

const SimplePathfinder = require('./SimplePathfinder');
const {
    normalizeVector,
    vectorToDirection,
    directionToVector,
    tryStep,
    findAlternateVector,
    clampDelta
} = require('./movement-utils');

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const MAX_DEFENDERS_PER_CITY = 4;
const MAX_TOTAL_DEFENDERS = 16;
const SPAWN_CHECK_INTERVAL = 3000;
const MIN_ENGAGE_TILES = 24;
const MAX_ENGAGE_TILES = 60;
const DEFAULT_ENGAGE_TILES = 40;
const ENGAGEMENT_RADIUS = TILE_SIZE * DEFAULT_ENGAGE_TILES;
const DISENGAGEMENT_RADIUS = ENGAGEMENT_RADIUS * 2;
const BASE_SPEED_MULTIPLIER = 1.0;
const SHOOT_INTERVAL = 750;
const SHOOT_RANGE = TILE_SIZE * 16;
const PATHFIND_INTERVAL = 1000;
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);
const PLAYER_COLLISION_RADIUS = TILE_SIZE * 0.4;
const DEBUG_EMIT_INTERVAL_MS = 500;
const ENABLE_BOT_DEBUG = process.env.BOT_DEBUG === 'true' || process.env.SERVER_BOT_DEBUG === 'true';
const SPAWN_SEARCH_RADIUS_TILES = 160;
const DEFENDER_ROLES = Object.freeze(['mayor', 'shooter', 'bomb_defuser', 'miner']);
const normalizeCityId = (value) => {
    const numeric = toFinite(value, null);
    if (numeric === null) {
        return null;
    }
    return Math.max(0, Math.floor(numeric));
};

const toFinite = (value, fallback = 0) => {
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

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

class DefenderBotManager {
    constructor({ game, playerFactory, bulletFactory, buildingFactory }) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.bulletFactory = bulletFactory;
        this.buildingFactory = buildingFactory;
        this.pathfinder = new SimplePathfinder(game);
        this.defenders = new Map();
        this.cityDefenders = new Map();
        this.nextSpawnCheck = 0;
        this.sequence = 1;
        this.nextDebugEmitAt = 0;
        this.cityRoleCursor = new Map();
    }

    computeEngagementRadius(cityId, centerX, centerY) {
        const fallback = ENGAGEMENT_RADIUS;
        const cities = this.game?.cities;
        if (!Array.isArray(cities) || cities.length === 0) {
            return fallback;
        }
        const currentId = normalizeCityId(cityId);
        let nearest = Infinity;
        cities.forEach((city, index) => {
            if (!city) {
                return;
            }
            const otherId = normalizeCityId(city.id ?? city.cityId ?? index);
            if (otherId === null || (currentId !== null && otherId === currentId)) {
                return;
            }
            const ox = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
            const oy = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
            const dx = ox - centerX;
            const dy = oy - centerY;
            const dist = Math.sqrt((dx * dx) + (dy * dy));
            if (dist < nearest) {
                nearest = dist;
            }
        });
        if (!Number.isFinite(nearest) || nearest === Infinity) {
            return fallback;
        }
        const minPx = MIN_ENGAGE_TILES * TILE_SIZE;
        const maxPx = MAX_ENGAGE_TILES * TILE_SIZE;
        const halfDistance = nearest / 2;
        return Math.max(minPx, Math.min(maxPx, halfDistance));
    }

    update(now = Date.now()) {
        if (!this.game || !this.playerFactory) {
            return;
        }

        if (now >= this.nextSpawnCheck) {
            this.nextSpawnCheck = now + SPAWN_CHECK_INTERVAL;
            this.evaluateSpawns(now);
        }

        this.updateDefenders(now);
    }

    evaluateSpawns(now) {
        const players = Object.values(this.game.players || {}).filter((p) => p && !p.isSystemControlled && !p.isFake && p.offset);
        const fakeCities = (this.game.cities || []).map((city, index) => ({ city, index }))
            .filter((entry) => entry.city && entry.city.isFake);

        if (!fakeCities.length) {
            return;
        }

        // Track which cities have nearby humans
        const citiesWithHumans = new Set();

        for (const { city, index } of fakeCities) {
            const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
            const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
            const cityId = normalizeCityId(city.id ?? city.cityId ?? index);
            if (cityId === null) {
                continue;
            }

            const engagementRadius = this.computeEngagementRadius(cityId, centerX, centerY);
            const engagementRadiusSq = engagementRadius * engagementRadius;

            const hasNearby = players.some((p) => {
                const distSq = distanceSquared(centerX, centerY, p.offset.x + HALF_TILE, p.offset.y + HALF_TILE);
                return distSq <= engagementRadiusSq;
            });

            if (!hasNearby) {
                // No humans nearby: remove defenders for this city
                this.removeCityDefenders(cityId);
                continue;
            }

            citiesWithHumans.add(cityId);

            const remaining = Math.max(0, MAX_TOTAL_DEFENDERS - this.defenders.size);
            if (remaining <= 0) {
                continue;
            }

            const currentCityCount = this.countDefendersForCity(cityId);
            const availableSlots = Math.min(
                remaining,
                Math.max(0, MAX_DEFENDERS_PER_CITY - currentCityCount)
            );
            const cityRoster = this.cityDefenders.get(cityId) || new Set();
            for (let i = 0; i < availableSlots; i += 1) {
                const role = this.nextRoleForCity(cityId);
                if (this.spawnDefender(cityId, centerX, centerY, now, role, { engagementRadius })) {
                    cityRoster.add(`defender_${cityId}_${this.sequence - 1}`);
                }
            }
            this.cityDefenders.set(cityId, cityRoster);
        }
    }

    nextRoleForCity(cityId) {
        const cursor = this.cityRoleCursor.get(cityId) || 0;
        const role = DEFENDER_ROLES[cursor % DEFENDER_ROLES.length];
        this.cityRoleCursor.set(cityId, cursor + 1);
        return role;
    }

    spawnDefender(cityId, centerX, centerY, now, role = null, options = {}) {
        const normalizedCity = normalizeCityId(cityId);
        if (normalizedCity === null) {
            return false;
        }
        const currentCityCount = this.countDefendersForCity(normalizedCity);
        if (currentCityCount >= MAX_DEFENDERS_PER_CITY) {
            if (ENABLE_BOT_DEBUG) {
                console.debug('[defender-bot] spawn skipped: city at cap', {
                    cityId: normalizedCity,
                    currentCityCount,
                    maxPerCity: MAX_DEFENDERS_PER_CITY,
                });
            }
            return false;
        }
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = TILE_SIZE * 10;
        let spawnX = centerX + Math.cos(angle) * spawnRadius;
        let spawnY = centerY + Math.sin(angle) * spawnRadius;

        // Snap spawn to nearest passable tile to avoid blocked starts
        const mask = this.pathfinder.navMask.getMask(1000, this.pathfinder.getMaskOptions(centerX, centerY, SPAWN_SEARCH_RADIUS_TILES));
        this.pathfinder.mask = mask;
        const spawnTileX = Math.floor(spawnX / TILE_SIZE);
        const spawnTileY = Math.floor(spawnY / TILE_SIZE);
        const nearest = this.pathfinder.findNearestPassable(
            spawnTileX,
            spawnTileY,
            SPAWN_SEARCH_RADIUS_TILES,
            { requireNeighbor: true }
        );
        if (nearest) {
            spawnX = (nearest.x * TILE_SIZE) + HALF_TILE;
            spawnY = (nearest.y * TILE_SIZE) + HALF_TILE;
        } else {
            if (ENABLE_BOT_DEBUG) {
                console.debug('[defender-bot] unable to find passable spawn tile', {
                    cityId,
                    centerX,
                    centerY,
                    spawnTileX,
                    spawnTileY
                });
            }
            return false;
        }

        const id = `defender_${cityId}_${this.sequence}`;
        this.sequence += 1;

        const player = this.playerFactory.createSystemPlayer({
            id,
            city: normalizedCity,
            offset: { x: spawnX, y: spawnY },
            direction: Math.floor(Math.random() * 32),
            isMoving: 0,
            isTurning: 0,
            health: 20,
            sequence: 0,
            isFake: true,
            role,
        }, {
            isFake: true,
            type: 'defender_bot',
            broadcast: true,
        });

        if (!player) {
            return false;
        }

        const bot = {
            id,
            cityId: normalizedCity,
            player,
            targetId: null,
            path: null,
            pathIndex: 0,
            nextPathAt: now + 250,
            nextShotAt: now + 600,
            engaged: false,
            role: role || null,
            engagementRadius: Number.isFinite(options.engagementRadius) ? options.engagementRadius : null,
            disengagementRadius: Number.isFinite(options.engagementRadius) ? options.engagementRadius * 2 : null,
        };
        this.defenders.set(id, bot);
        return true;
    }

    updateDefenders(now) {
        const removals = [];
        for (const bot of this.defenders.values()) {
            if (!bot || !bot.player) {
                continue;
            }
            if (bot.player.health <= 0) {
                removals.push(bot.id);
                continue;
            }
            const city = this.game.cities?.[bot.cityId];
            if (!city || !city.isFake) {
                removals.push(bot.id);
                continue;
            }
            const target = this.pickTarget(bot);
            if (!target) {
                const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
                const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
                const distSq = distanceSquared(bot.player.offset.x + HALF_TILE, bot.player.offset.y + HALF_TILE, centerX, centerY);
                if (distSq > (DISENGAGEMENT_RADIUS * DISENGAGEMENT_RADIUS)) {
                    removals.push(bot.id);
                    continue;
                }
            }
            this.updateMovement(bot, target, now);
            this.tryShoot(bot, target, now);
        }

        removals.forEach((id) => this.removeBot(id));
        this.emitDebugPaths(now);
    }

    pickTarget(bot) {
        let closest = null;
        let closestDist = Infinity;
        for (const player of Object.values(this.game.players || {})) {
            if (!player || player.isSystemControlled || player.isFake) {
                continue;
            }
            if (!player.offset) {
                continue;
            }
            const distSq = distanceSquared(
                bot.player.offset.x + HALF_TILE,
                bot.player.offset.y + HALF_TILE,
                player.offset.x + HALF_TILE,
                player.offset.y + HALF_TILE
            );
            if (distSq < closestDist && distSq <= (DISENGAGEMENT_RADIUS * DISENGAGEMENT_RADIUS)) {
                closest = player;
                closestDist = distSq;
            }
        }
        bot.targetId = closest ? closest.id : null;
        return closest;
    }

    rebuildPath(bot, target) {
        if (!target || !target.offset) {
            bot.path = null;
            bot.pathIndex = 0;
            return;
        }
        const start = {
            x: bot.player.offset.x + HALF_TILE,
            y: bot.player.offset.y + HALF_TILE
        };
        const goal = {
            x: target.offset.x + HALF_TILE,
            y: target.offset.y + HALF_TILE
        };
        // Refresh mask around the goal so we get up-to-date passability
        const mask = this.pathfinder.navMask.getMask(2000, this.pathfinder.getMaskOptions(goal.x, goal.y, 80));
        this.pathfinder.mask = mask;
        let startTile = {
            x: Math.floor(start.x / TILE_SIZE),
            y: Math.floor(start.y / TILE_SIZE)
        };
        if (mask && typeof mask.isBlockedTile === 'function' && mask.isBlockedTile(startTile.x, startTile.y)) {
            const nearest = this.pathfinder.findNearestPassable(startTile.x, startTile.y, 80, { requireNeighbor: true });
            if (nearest) {
                // Nudge bot to the nearest free tile so it can pathfind/escape
                bot.player.offset.x = (nearest.x * TILE_SIZE) + HALF_TILE;
                bot.player.offset.y = (nearest.y * TILE_SIZE) + HALF_TILE;
                start.x = bot.player.offset.x;
                start.y = bot.player.offset.y;
                startTile = { x: nearest.x, y: nearest.y };
                this.emitPlayer(bot.player);
            }
        }

        const path = this.pathfinder.findPath(
            start.x,
            start.y,
            goal.x,
            goal.y,
            { radiusTiles: 120, maxNodes: 8000 }
        );
        bot.path = Array.isArray(path) ? path : null;
        bot.pathIndex = 0;
        bot.pathDebug = {
            start,
            goal,
            status: bot.path ? 'ok' : 'no_path',
            pathLength: bot.path ? bot.path.length : 0,
            updatedAt: Date.now(),
            startTile,
        };
        if (ENABLE_BOT_DEBUG && !bot.path) {
            // Suppress noisy failure logs now that pathing is stable
        }
    }

    updateMovement(bot, target, now) {
        if (now >= bot.nextPathAt) {
            bot.nextPathAt = now + PATHFIND_INTERVAL;
            this.rebuildPath(bot, target);
        }

        let vector = null;
        if (bot.path && bot.path.length && bot.pathIndex < bot.path.length) {
            const waypoint = bot.path[bot.pathIndex];
            const dx = waypoint.x - (bot.player.offset.x + HALF_TILE);
            const dy = waypoint.y - (bot.player.offset.y + HALF_TILE);
            const distSq = (dx * dx) + (dy * dy);
            if (distSq < (PLAYER_COLLISION_RADIUS * PLAYER_COLLISION_RADIUS)) {
                bot.pathIndex += 1;
            } else {
                vector = normalizeVector(dx, dy);
            }
        } else if (target && target.offset) {
            const dx = (target.offset.x + HALF_TILE) - (bot.player.offset.x + HALF_TILE);
            const dy = (target.offset.y + HALF_TILE) - (bot.player.offset.y + HALF_TILE);
            vector = normalizeVector(dx, dy);
        }

        const delta = clampDelta(this.game.timePassed);
        const step = delta * BASE_SPEED_MULTIPLIER * 0.24;
        if (vector && step > 0) {
            if (!tryStep(bot.player, vector, step, (x, y) => this.pathfinder.mask.isBlocked(x, y))) {
                const alternate = findAlternateVector(bot.player, vector, step, AVOIDANCE_ANGLES, (x, y) => this.pathfinder.mask.isBlocked(x, y));
                if (alternate) {
                    vector = alternate;
                    tryStep(bot.player, alternate, step, (x, y) => this.pathfinder.mask.isBlocked(x, y));
                }
            }
            bot.player.isMoving = 1;
            bot.player.direction = vectorToDirection(vector.dx, vector.dy, bot.player.direction);
        } else {
            bot.player.isMoving = 0;
        }

        bot.player.sequence = (bot.player.sequence || 0) + 1;
        this.emitPlayer(bot.player);
    }

    tryShoot(bot, target, now) {
        if (!target || !target.offset) {
            return;
        }
        if (now < bot.nextShotAt) {
            return;
        }
        const distSq = distanceSquared(
            bot.player.offset.x + HALF_TILE,
            bot.player.offset.y + HALF_TILE,
            target.offset.x + HALF_TILE,
            target.offset.y + HALF_TILE
        );
        if (distSq > (SHOOT_RANGE * SHOOT_RANGE)) {
            return;
        }

        const dx = (target.offset.x + HALF_TILE) - (bot.player.offset.x + HALF_TILE);
        const dy = (target.offset.y + HALF_TILE) - (bot.player.offset.y + HALF_TILE);
        const direction = vectorToDirection(dx, dy, bot.player.direction);
        const muzzle = directionToVector(direction);
        const originX = (bot.player.offset.x + HALF_TILE) + (muzzle.dx * 30);
        const originY = (bot.player.offset.y + HALF_TILE) + (muzzle.dy * 30);

        this.bulletFactory.spawnSystemBullet({
            x: originX,
            y: originY,
            angle: direction * -1,
            type: 0,
            teamId: bot.cityId,
            sourceId: bot.id,
            sourceType: 'defender_bot',
            shooterId: bot.id,
            targetId: target.id,
        });
        bot.nextShotAt = now + SHOOT_INTERVAL;
    }

    emitPlayer(player) {
        if (this.playerFactory && this.playerFactory.io) {
            this.playerFactory.io.emit('player', JSON.stringify(player));
        }
    }

    emitDebugPaths(now) {
        if (!ENABLE_BOT_DEBUG) {
            return;
        }
        if (!this.playerFactory || !this.playerFactory.io) {
            return;
        }
        const timestamp = Number.isFinite(now) ? now : Date.now();
        if (timestamp < this.nextDebugEmitAt) {
            return;
        }
        this.nextDebugEmitAt = timestamp + DEBUG_EMIT_INTERVAL_MS;
        const payload = [];
        for (const bot of this.defenders.values()) {
            if (!bot || !bot.id) {
                continue;
            }
            payload.push({
                id: bot.id,
                path: Array.isArray(bot.path) ? bot.path.map((point) => ({
                    x: point.x,
                    y: point.y
                })) : [],
                start: bot.pathDebug?.start || null,
                goal: bot.pathDebug?.goal || null,
                status: bot.pathDebug?.status || (bot.path ? 'ok' : 'no_path'),
                pathLength: bot.pathDebug?.pathLength ?? (bot.path ? bot.path.length : 0),
                targetId: bot.targetId ?? null,
                updatedAt: bot.pathDebug?.updatedAt || Date.now(),
            });
        }
        if (payload.length > 0) {
            this.playerFactory.io.emit('bot:debug:defenders', payload);
        }
    }

    removeBot(id) {
        const bot = this.defenders.get(id);
        this.defenders.delete(id);
        if (bot && bot.cityId !== undefined) {
            const cityKey = normalizeCityId(bot.cityId);
            const roster = this.cityDefenders.get(cityKey);
            if (roster) {
                roster.delete(id);
            }
        }
        if (bot && this.playerFactory) {
            this.playerFactory.removeSystemPlayer(id, { broadcast: true });
        }
    }

    removeCityDefenders(cityId) {
        const normalizedCity = normalizeCityId(cityId);
        if (normalizedCity === null) {
            return;
        }
        const ids = [];
        for (const bot of this.defenders.values()) {
            if (bot && normalizeCityId(bot.cityId) === normalizedCity) {
                ids.push(bot.id);
            }
        }
        ids.forEach((id) => this.removeBot(id));
        this.cityDefenders.set(normalizedCity, new Set());
    }

    countDefendersForCity(cityId) {
        const normalizedCity = normalizeCityId(cityId);
        if (normalizedCity === null) {
            return 0;
        }
        let count = 0;
        for (const bot of this.defenders.values()) {
            if (bot && normalizeCityId(bot.cityId) === normalizedCity) {
                count += 1;
            }
        }
        return count;
    }
}

module.exports = DefenderBotManager;
