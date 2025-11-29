"use strict";

const {
    normalizeVector,
    vectorToDirection,
    directionToVector,
    clampDelta,
    tryStep,
    findAlternateVector,
} = require('./movement-utils');
const SimplePathfinder = require('./SimplePathfinder');

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const MAX_ROGUES = 2;
const CITY_SIZE_THRESHOLD = 18;
const SPAWN_INTERVAL = 5000;
const MOVE_DECISION_INTERVAL = 1200;
const SHOOT_INTERVAL = 1400;
const SHOOT_RANGE = TILE_SIZE * 12;
const BASE_SPEED_MULTIPLIER = 0.85;
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);

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

class RogueBotManager {
    constructor({ game, playerFactory, bulletFactory, buildingFactory }) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.bulletFactory = bulletFactory;
        this.buildingFactory = buildingFactory;
        this.pathfinder = new SimplePathfinder(game);
        this.rogues = new Map();
        this.nextSpawnCheck = 0;
        this.sequence = 1;
    }

    update(now = Date.now()) {
        if (now >= this.nextSpawnCheck) {
            this.nextSpawnCheck = now + SPAWN_INTERVAL;
            this.evaluateSpawns(now);
        }
        this.updateRogues(now);
    }

    evaluateSpawns(now) {
        if (this.rogues.size >= MAX_ROGUES) {
            return;
        }
        const players = Object.values(this.game.players || {}).filter((p) => p && !p.isSystemControlled && !p.isFake);
        if (!players.length) {
            return;
        }
        const primary = players[0];
        const cityId = Number.isFinite(primary.city) ? primary.city : null;
        if (cityId === null) {
            return;
        }
        const buildingCount = this.countBuildingsForCity(cityId);
        if (buildingCount < CITY_SIZE_THRESHOLD) {
            return;
        }
        const city = this.game.cities?.[cityId];
        if (!city || !city.isOrbable) {
            return;
        }

        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        this.spawnRogue(cityId, centerX, centerY, now);
    }

    spawnRogue(cityId, centerX, centerY, now) {
        if (this.rogues.size >= MAX_ROGUES) {
            return false;
        }
        const angle = Math.random() * Math.PI * 2;
        const spawnRadius = TILE_SIZE * 18;
        const spawnX = centerX + Math.cos(angle) * spawnRadius;
        const spawnY = centerY + Math.sin(angle) * spawnRadius;
        const id = `rogue_${cityId}_${this.sequence}`;
        this.sequence += 1;

        const player = this.playerFactory.createSystemPlayer({
            id,
            city: -1,
            offset: { x: spawnX, y: spawnY },
            direction: Math.floor(Math.random() * 32),
            isMoving: 0,
            isTurning: 0,
            health: 20,
            sequence: 0,
            isFake: true,
        }, {
            isFake: true,
            type: 'rogue_tank',
            broadcast: true,
        });

        if (!player) {
            return false;
        }

        this.rogues.set(id, {
            id,
            player,
            targetCityId: cityId,
            nextDecisionAt: now,
            nextShotAt: now + 900,
            path: null,
            pathIndex: 0,
        });
        return true;
    }

    updateRogues(now) {
        const removals = [];
        for (const rogue of this.rogues.values()) {
            if (!rogue || !rogue.player) {
                continue;
            }
            if (rogue.player.health <= 0) {
                removals.push(rogue.id);
                continue;
            }
            const city = this.game.cities?.[rogue.targetCityId];
            if (!city) {
                removals.push(rogue.id);
                continue;
            }
            this.updateMovement(rogue, city, now);
            this.tryShoot(rogue, city, now);
        }
        removals.forEach((id) => this.removeRogue(id));
    }

    updateMovement(rogue, city, now) {
        if (now >= rogue.nextDecisionAt) {
            rogue.nextDecisionAt = now + MOVE_DECISION_INTERVAL;
            this.rebuildPath(rogue, city);
        }

        let vector = null;
        if (rogue.path && rogue.path.length && rogue.pathIndex < rogue.path.length) {
            const waypoint = rogue.path[rogue.pathIndex];
            const dx = waypoint.x - (rogue.player.offset.x + HALF_TILE);
            const dy = waypoint.y - (rogue.player.offset.y + HALF_TILE);
            const distSq = (dx * dx) + (dy * dy);
            if (distSq < (TILE_SIZE * TILE_SIZE * 0.5)) {
                rogue.pathIndex += 1;
            } else {
                vector = normalizeVector(dx, dy);
            }
        }

        if (!vector) {
            const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
            const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
            vector = normalizeVector(centerX - (rogue.player.offset.x + HALF_TILE), centerY - (rogue.player.offset.y + HALF_TILE));
        }

        const delta = clampDelta(this.game.timePassed);
        const step = delta * BASE_SPEED_MULTIPLIER * 0.22;
        if (vector && step > 0) {
            if (!tryStep(rogue.player, vector, step, (x, y) => this.pathfinder.mask.isBlocked(x, y))) {
                const alternate = findAlternateVector(rogue.player, vector, step, AVOIDANCE_ANGLES, (x, y) => this.pathfinder.mask.isBlocked(x, y));
                if (alternate) {
                    vector = alternate;
                    tryStep(rogue.player, alternate, step, (x, y) => this.pathfinder.mask.isBlocked(x, y));
                }
            }
            rogue.player.isMoving = 1;
            rogue.player.direction = vectorToDirection(vector.dx, vector.dy, rogue.player.direction);
        } else {
            rogue.player.isMoving = 0;
        }
        rogue.player.sequence = (rogue.player.sequence || 0) + 1;
        this.emitPlayer(rogue.player);
    }

    rebuildPath(rogue, city) {
        if (!city) {
            rogue.path = null;
            rogue.pathIndex = 0;
            return;
        }
        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        const path = this.pathfinder.findPath(
            rogue.player.offset.x + HALF_TILE,
            rogue.player.offset.y + HALF_TILE,
            centerX,
            centerY,
        );
        rogue.path = Array.isArray(path) ? path : null;
        rogue.pathIndex = 0;
    }

    tryShoot(rogue, city, now) {
        if (now < rogue.nextShotAt) {
            return;
        }
        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        const distSq = distanceSquared(rogue.player.offset.x + HALF_TILE, rogue.player.offset.y + HALF_TILE, centerX, centerY);
        if (distSq > (SHOOT_RANGE * SHOOT_RANGE)) {
            return;
        }

        const dx = centerX - (rogue.player.offset.x + HALF_TILE);
        const dy = centerY - (rogue.player.offset.y + HALF_TILE);
        const direction = vectorToDirection(dx, dy, rogue.player.direction);
        const muzzle = directionToVector(direction);
        const originX = (rogue.player.offset.x + HALF_TILE) + (muzzle.dx * 30);
        const originY = (rogue.player.offset.y + HALF_TILE) + (muzzle.dy * 30);

        this.bulletFactory.spawnSystemBullet({
            x: originX,
            y: originY,
            angle: direction * -1,
            type: 0,
            teamId: null,
            sourceId: rogue.id,
            sourceType: 'rogue_tank',
            shooterId: rogue.id,
            targetId: null,
        });
        rogue.nextShotAt = now + SHOOT_INTERVAL;
    }

    countBuildingsForCity(cityId) {
        if (!this.buildingFactory || !this.buildingFactory.buildings || typeof this.buildingFactory.buildings.values !== 'function') {
            return 0;
        }
        let count = 0;
        for (const building of this.buildingFactory.buildings.values()) {
            if (Number.isFinite(building?.cityId) && Math.floor(building.cityId) === Math.floor(cityId)) {
                count += 1;
            }
        }
        return count;
    }

    emitPlayer(player) {
        if (this.playerFactory && this.playerFactory.io) {
            this.playerFactory.io.emit('player', JSON.stringify(player));
        }
    }

    removeRogue(id) {
        this.rogues.delete(id);
        if (this.playerFactory) {
            this.playerFactory.removeSystemPlayer(id, { broadcast: true });
        }
    }
}

module.exports = RogueBotManager;

