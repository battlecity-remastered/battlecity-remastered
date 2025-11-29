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
const MAX_TOTAL_DEFENDERS = 4;
const SPAWN_CHECK_INTERVAL = 3000;
const ENGAGEMENT_RADIUS = TILE_SIZE * 30;
const DISENGAGEMENT_RADIUS = ENGAGEMENT_RADIUS * 2;
const BASE_SPEED_MULTIPLIER = 1.0;
const SHOOT_INTERVAL = 750;
const SHOOT_RANGE = TILE_SIZE * 16;
const PATHFIND_INTERVAL = 1000;
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);
const PLAYER_COLLISION_RADIUS = TILE_SIZE * 0.4;

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
        const players = Object.values(this.game.players || {}).filter((p) => p && !p.isSystemControlled && !p.isFake);
        if (!players.length) {
            return;
        }

        const fakeCities = (this.game.cities || []).map((city, index) => ({ city, index }))
            .filter((entry) => entry.city && entry.city.isFake);
        if (!fakeCities.length) {
            return;
        }

        const remaining = Math.max(0, MAX_TOTAL_DEFENDERS - this.defenders.size);
        if (remaining <= 0) {
            return;
        }

        let best = null;
        for (const player of players) {
            if (!player.offset) {
                continue;
            }
            for (const { city, index } of fakeCities) {
                const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
                const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
                const distSq = distanceSquared(centerX, centerY, player.offset.x + HALF_TILE, player.offset.y + HALF_TILE);
                if (distSq > (ENGAGEMENT_RADIUS * ENGAGEMENT_RADIUS)) {
                    continue;
                }
                if (best && distSq >= best.distSq) {
                    continue;
                }
                best = { city, cityId: city.id ?? city.cityId ?? index, centerX, centerY, distSq };
            }
        }

        if (!best || !Number.isFinite(best.cityId)) {
            return;
        }

        const cityRoster = this.cityDefenders.get(best.cityId) || new Set();
        const availableSlots = Math.min(remaining, MAX_DEFENDERS_PER_CITY - cityRoster.size);
        for (let i = 0; i < availableSlots; i += 1) {
            if (this.spawnDefender(best.cityId, best.centerX, best.centerY, now)) {
                cityRoster.add(`defender_${best.cityId}_${this.sequence - 1}`);
            }
        }
        this.cityDefenders.set(best.cityId, cityRoster);
    }

    spawnDefender(cityId, centerX, centerY, now) {
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = TILE_SIZE * 10;
        const spawnX = centerX + Math.cos(angle) * spawnRadius;
        const spawnY = centerY + Math.sin(angle) * spawnRadius;

        const id = `defender_${cityId}_${this.sequence}`;
        this.sequence += 1;

        const player = this.playerFactory.createSystemPlayer({
            id,
            city: cityId,
            offset: { x: spawnX, y: spawnY },
            direction: Math.floor(Math.random() * 32),
            isMoving: 0,
            isTurning: 0,
            health: 20,
            sequence: 0,
            isFake: true,
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
            cityId,
            player,
            targetId: null,
            path: null,
            pathIndex: 0,
            nextPathAt: now + 250,
            nextShotAt: now + 600,
            engaged: false,
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
        const path = this.pathfinder.findPath(
            bot.player.offset.x + HALF_TILE,
            bot.player.offset.y + HALF_TILE,
            target.offset.x + HALF_TILE,
            target.offset.y + HALF_TILE,
        );
        bot.path = Array.isArray(path) ? path : null;
        bot.pathIndex = 0;
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

    removeBot(id) {
        const bot = this.defenders.get(id);
        this.defenders.delete(id);
        if (bot && bot.cityId !== undefined) {
            const roster = this.cityDefenders.get(bot.cityId);
            if (roster) {
                roster.delete(id);
            }
        }
        if (bot && this.playerFactory) {
            this.playerFactory.removeSystemPlayer(id, { broadcast: true });
        }
    }
}

module.exports = DefenderBotManager;

