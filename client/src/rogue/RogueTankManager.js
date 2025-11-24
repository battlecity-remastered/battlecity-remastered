import { MOVEMENT_SPEED_PLAYER } from '../constants';
import { ITEM_TYPE_TURRET } from '../constants';
import { ITEM_TYPE_PLASMA } from '../constants';
import { ITEM_TYPE_BOMB } from '../constants';
import { getCityDisplayName } from '../utils/citySpawns';
import { normalizeVector, rotateVector, vectorToDirection, directionToVector, clampDelta, tryStep, findAlternateVector } from '../bots/movement-utils.js';
import { createBlockingChecker } from '../bots/collision.js';

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const SPRITE_GAP = 8;
const MAX_GLOBAL_TANKS = 2;
const MAX_TANKS_PER_CITY = 2;
const CITY_SIZE_THRESHOLD = 18;
const CITY_SECOND_TANK_THRESHOLD = 32;
const SPAWN_EVALUATION_INTERVAL = 5000;
const MOVE_DECISION_INTERVAL = 1300;
const TARGET_REFRESH_INTERVAL = 2200;
const BASE_SPEED_MULTIPLIER = 0.85;
const SHOOT_INTERVAL = 1400;
const SHOOT_RANGE = TILE_SIZE * 12;
const SHOOT_INACCURACY = 4;
const BOMB_INTERVAL = 6500;
const BOMB_INTERVAL_JITTER = 3200;
const BOMB_FUSE = 2400;
const BOMB_FUSE_JITTER = 900;
const BOMB_DROP_RADIUS = TILE_SIZE * 9;
const MAX_LIFETIME = 240000;
const WANDER_RADIUS = TILE_SIZE * 7;
const ROGUE_ENGAGE_RADIUS = TILE_SIZE * 11;
const ROGUE_MIN_SPAWN_RADIUS = TILE_SIZE * 13;
const ROGUE_SPAWN_RADIUS_VARIANCE = TILE_SIZE * 7;
const ROGUE_SPAWN_MAX_ATTEMPTS = 20;
const RESPAWN_BASE_DELAY = 60000;
const RESPAWN_DELAY_JITTER = 60000;
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);
const DIRECTION_THRESHOLD = TILE_SIZE * 2.5;

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

const describeDirectionFromCity = (cityX, cityY, targetX, targetY, threshold = DIRECTION_THRESHOLD) => {
    const dx = targetX - cityX;
    const dy = targetY - cityY;
    let horizontal = '';
    let vertical = '';
    if (Math.abs(dx) > threshold) {
        horizontal = dx > 0 ? 'east' : 'west';
    }
    if (Math.abs(dy) > threshold) {
        vertical = dy > 0 ? 'south' : 'north';
    }
    if (horizontal && vertical) {
        return `${vertical}-${horizontal}`;
    }
    return vertical || horizontal || '';
};

class RogueTankManager {

    constructor(game) {
        this.game = game;
        this.tanks = [];
        this.nextId = 1;
        this.nextSpawnCheck = 0;
        this.instancePrefix = `local_${Math.random().toString(16).slice(-6)}`;
        this.nextAllowedSpawnTime = 0;
        this.cityRadiusCache = new Map();
        this.blocking = createBlockingChecker(game);
    }

    getCallsignRegistry() {
        return this.game?.callsignRegistry || null;
    }

    assignCallsign(id) {
        const registry = this.getCallsignRegistry();
        if (!registry) {
            return null;
        }
        try {
            return registry.assign(id);
        } catch (_error) {
            return null;
        }
    }

    releaseCallsign(id) {
        const registry = this.getCallsignRegistry();
        if (!registry) {
            return;
        }
        try {
            registry.release(id);
        } catch (_error) {
            // no-op
        }
    }

    sanitizeIdComponent(value) {
        if (!value || typeof value !== 'string') {
            return null;
        }
        return value.replace(/[^a-zA-Z0-9_-]/g, '');
    }

    getClientInstanceId() {
        const socketId = this.game?.socketListener?.io?.id;
        const cleaned = this.sanitizeIdComponent(socketId);
        if (cleaned && cleaned.length) {
            return cleaned;
        }
        return this.instancePrefix;
    }

    createTankId() {
        const prefix = this.getClientInstanceId();
        const id = `rogue_${prefix}_${this.nextId}`;
        this.nextId += 1;
        return id;
    }

    emitTankShot(_tank, _originX, _originY, _direction) {
        // Client-side only: do not notify server about rogue shots.
        return;
    }

    update() {
        if (!this.game || !this.game.buildingFactory) {
            return;
        }

        const now = this.game.tick || Date.now();

        if (now >= this.nextSpawnCheck) {
            this.nextSpawnCheck = now + SPAWN_EVALUATION_INTERVAL;
            this.evaluateSpawns(now);
        }

        this.updateTanks(now);
    }

    evaluateSpawns(now) {
        const timestamp = Number.isFinite(now) ? now : (this.game.tick || Date.now());
        const cities = this.game.cities || [];
        if (!cities.length) {
            return;
        }

        let globalSlots = Math.max(0, MAX_GLOBAL_TANKS - this.tanks.length);
        if (globalSlots === 0) {
            return;
        }

        if (this.tanks.length === 0 && this.nextAllowedSpawnTime > 0 && timestamp < this.nextAllowedSpawnTime) {
            return;
        }

        cities.forEach((city, index) => {
            if (!city || globalSlots <= 0) {
                return;
            }
            const buildingCount = this.game.buildingFactory.countBuildingsForCity(index);
            if (buildingCount < CITY_SIZE_THRESHOLD) {
                return;
            }

            const existing = this.tanks.filter(tank => tank.targetCityId === index);
            const desired = buildingCount >= CITY_SECOND_TANK_THRESHOLD ? 2 : 1;
            const targetPerCity = Math.min(desired, MAX_TANKS_PER_CITY);
            const deficit = Math.min(globalSlots, targetPerCity - existing.length);
            for (let i = 0; i < deficit; i += 1) {
                if (this.spawnTankNearCity(city, index, timestamp)) {
                    globalSlots -= 1;
                    if (globalSlots <= 0) {
                        return;
                    }
                }
            }
        });
    }

    updateTanks(now) {
        for (let i = this.tanks.length - 1; i >= 0; i -= 1) {
            const tank = this.tanks[i];
            if (!tank) {
                this.tanks.splice(i, 1);
                continue;
            }

            const lifetime = now - tank.spawnedAt;
            if (lifetime > MAX_LIFETIME || !this.cityStillValid(tank.targetCityId)) {
                this.removeTankAtIndex(i);
                continue;
            }

            this.refreshTarget(tank, now);
            this.updateMovement(tank, now);
            this.tryShoot(tank, now);
            this.tryDropBomb(tank, now);
            this.updateBombs(tank, now);
        }
    }

    cityStillValid(cityId) {
        const city = this.game.cities?.[cityId];
        if (!city) {
            return false;
        }
        const buildingCount = this.game.buildingFactory.countBuildingsForCity(cityId);
        return buildingCount >= (CITY_SIZE_THRESHOLD - 3);
    }

    spawnTankNearCity(city, cityId, now) {
        const cityX = toFinite(city?.x, 0);
        const cityY = toFinite(city?.y, 0);
        const centerX = cityX + (TILE_SIZE * 1.5);
        const centerY = cityY + (TILE_SIZE * 1.5);
        const minDistance = ROGUE_MIN_SPAWN_RADIUS;
        const maxDistance = ROGUE_MIN_SPAWN_RADIUS + ROGUE_SPAWN_RADIUS_VARIANCE;

        for (let attempt = 0; attempt < ROGUE_SPAWN_MAX_ATTEMPTS; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const distance = minDistance + (Math.random() * (maxDistance - minDistance));
            let spawnX = centerX + Math.cos(angle) * distance;
            let spawnY = centerY + Math.sin(angle) * distance;
            spawnX = Math.max(HALF_TILE, Math.min((512 * TILE_SIZE) - HALF_TILE, spawnX));
            spawnY = Math.max(HALF_TILE, Math.min((512 * TILE_SIZE) - HALF_TILE, spawnY));
            if (this.blocking.isBlocked(spawnX, spawnY)) {
                continue;
            }

            const tankId = this.createTankId();
            const timestamp = Number.isFinite(now) ? now : (this.game.tick || Date.now());
            const engageRadius = this.getCityEngageRadius(cityId, timestamp);
            const tank = {
                id: tankId,
                offset: { x: spawnX, y: spawnY },
                lastSafeOffset: { x: spawnX, y: spawnY },
                direction: Math.floor(Math.random() * 32),
                isMoving: 0,
                targetCityId: cityId,
                target: null,
                nextDecisionAt: timestamp + 250 + Math.random() * 250,
                nextTargetRefresh: timestamp + Math.random() * 500,
                fireCooldown: timestamp + 1400 + Math.random() * 900,
                bombCooldown: timestamp + 3800 + Math.random() * 2200,
                activeBombs: [],
                spawnedAt: timestamp,
                city: -1,
                health: 20,
                cachedVector: null,
                notifiedAttack: false,
                engageRadius,
                nextRadiusRefresh: timestamp + 5000
            };
            tank.callsign = this.assignCallsign(tankId) || `Rogue ${this.nextId}`;

            this.tanks.push(tank);
            this.game.forceDraw = true;
            return true;
        }

        return false;
    }

    getCityCenter(cityId) {
        const city = this.game.cities?.[cityId];
        if (!city) {
            return null;
        }
        const x = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const y = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        return { x, y };
    }

    isCityOrbable(cityId) {
        const city = this.game.cities?.[cityId];
        return !!(city && city.isOrbable);
    }

    refreshTarget(tank, now) {
        if (now < tank.nextTargetRefresh) {
            return;
        }
        tank.nextTargetRefresh = now + TARGET_REFRESH_INTERVAL + Math.random() * 1200;

        // Rogues should target the player's home base, not the city being attacked
        const playerHomeCity = this.game.player?.city;
        const targetCityId = Number.isFinite(playerHomeCity) ? playerHomeCity : tank.targetCityId;

        const cityCenter = this.getCityCenter(targetCityId);
        const cityOrbable = this.isCityOrbable(targetCityId);
        if (cityCenter) {
            if (!Number.isFinite(tank.engageRadius) || now >= (tank.nextRadiusRefresh || 0)) {
                tank.engageRadius = this.getCityEngageRadius(targetCityId, now);
                tank.nextRadiusRefresh = now + 5000;
            }
            const engageRadius = Number.isFinite(tank.engageRadius) ? tank.engageRadius : ROGUE_ENGAGE_RADIUS;
            const distSq = distanceSquared(
                tank.offset.x + HALF_TILE,
                tank.offset.y + HALF_TILE,
                cityCenter.x,
                cityCenter.y
            );
            // If city not orbable yet, linger at the perimeter instead of diving in
            if (!cityOrbable) {
                const desiredRadius = engageRadius * 0.9;
                if (distSq < (desiredRadius * desiredRadius)) {
                    const angle = Math.random() * Math.PI * 2;
                    tank.target = {
                        kind: 'point',
                        x: cityCenter.x + Math.cos(angle) * engageRadius,
                        y: cityCenter.y + Math.sin(angle) * engageRadius
                    };
                    return;
                }
            }
            if (distSq > (engageRadius * engageRadius)) {
                tank.target = {
                    kind: 'point',
                    x: cityCenter.x,
                    y: cityCenter.y
                };
                return;
            }
            if (cityOrbable) {
                this.notifyCityUnderAttack(tank, targetCityId, cityCenter, engageRadius);
            }
        }

        const turretTarget = this.pickNearestTurret(tank);
        if (turretTarget) {
            tank.target = turretTarget;
            return;
        }

        const fallback = this.pickWanderPoint(targetCityId);
        tank.target = fallback;
    }

    pickNearestTurret(tank) {
        const manager = this.game.itemFactory;
        if (!manager) {
            return null;
        }

        let node = manager.getHead();
        let best = null;
        const maxDistanceSq = SHOOT_RANGE * SHOOT_RANGE * 1.3;

        while (node) {
            if (node.type === ITEM_TYPE_TURRET || node.type === ITEM_TYPE_PLASMA) {
                const distSq = distanceSquared(node.x + HALF_TILE, node.y + HALF_TILE, tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE);
                if (distSq < maxDistanceSq && (!best || distSq < best.distanceSq)) {
                    best = {
                        kind: 'item',
                        id: node.id,
                        x: node.x + HALF_TILE,
                        y: node.y + HALF_TILE,
                        distanceSq: distSq
                    };
                }
            }
            node = node.next;
        }

        return best;
    }

    pickWanderPoint(cityId) {
        const city = this.game.cities?.[cityId];
        const baseX = toFinite(city?.x, 0) + (TILE_SIZE * 1.5);
        const baseY = toFinite(city?.y, 0) + (TILE_SIZE * 1.5);
        const angle = Math.random() * Math.PI * 2;
        const radius = (TILE_SIZE * 2) + (Math.random() * WANDER_RADIUS);
        return {
            kind: 'point',
            x: baseX + Math.cos(angle) * radius,
            y: baseY + Math.sin(angle) * radius
        };
    }

    updateMovement(tank, now) {
        if (now < tank.nextDecisionAt) {
            const moved = this.applyMovement(tank, now, tank.cachedVector);
            if (!moved) {
                tank.nextDecisionAt = now;
            }
            return;
        }

        tank.nextDecisionAt = now + MOVE_DECISION_INTERVAL + Math.random() * 900;

        const target = this.resolveTargetPosition(tank.target);
        if (!target) {
            tank.cachedVector = null;
            tank.isMoving = 0;
            return;
        }

        const dx = target.x - (tank.offset.x + HALF_TILE);
        const dy = target.y - (tank.offset.y + HALF_TILE);
        const distanceSq = (dx * dx) + (dy * dy);

        if (distanceSq < (TILE_SIZE * TILE_SIZE * 2.5)) {
            tank.cachedVector = null;
            tank.isMoving = 0;
            return;
        }

        const vector = normalizeVector(dx, dy);
        const jitter = ((Math.random() - 0.5) * 0.4);
        const adjusted = normalizeVector(vector.dx + jitter, vector.dy + jitter);
        tank.cachedVector = adjusted;
        tank.direction = vectorToDirection(adjusted.dx, adjusted.dy, tank.direction);
        const moved = this.applyMovement(tank, now, adjusted);
        if (!moved) {
            tank.nextDecisionAt = now + 400 + Math.random() * 300;
        }
    }

    applyMovement(tank, now, vector) {
        if (!vector || !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)) {
            tank.isMoving = 0;
            return false;
        }
        if (Math.abs(vector.dx) < 1e-4 && Math.abs(vector.dy) < 1e-4) {
            tank.isMoving = 0;
            return false;
        }
        const delta = clampDelta(this.game.timePassed);
        const step = delta * MOVEMENT_SPEED_PLAYER * BASE_SPEED_MULTIPLIER;
        if (step <= 0) {
            return false;
        }

        if (tryStep(tank, vector, step, this.blocking.isBlocked)) {
            tank.isMoving = 1;
            return true;
        }

        const alternate = findAlternateVector(tank, vector, step, AVOIDANCE_ANGLES, this.blocking.isBlocked);
        if (alternate && tryStep(tank, alternate, step, this.blocking.isBlocked)) {
            tank.cachedVector = alternate;
            tank.direction = vectorToDirection(alternate.dx, alternate.dy, tank.direction);
            tank.isMoving = 1;
            return true;
        }

        tank.isMoving = 0;
        tank.cachedVector = null;
        tank.nextDecisionAt = Math.min(tank.nextDecisionAt || (now + 400), now + 450 + Math.random() * 250);
        return false;
    }

    resolveTargetPosition(target) {
        if (!target) {
            return null;
        }
        if (target.kind === 'item' && target.id) {
            const item = this.game.itemFactory?.itemsById?.get(target.id);
            if (item) {
                target.x = item.x + HALF_TILE;
                target.y = item.y + HALF_TILE;
                return target;
            }
            return null;
        }
        return target;
    }

    tryShoot(tank, now) {
        if (now < tank.fireCooldown) {
            return;
        }

        const target = this.resolveTargetPosition(tank.target);
        if (!target) {
            return;
        }

        const distSq = distanceSquared(tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE, target.x, target.y);
        if (!this.isCityOrbable(tank.targetCityId)) {
            return;
        }

        if (distSq > (SHOOT_RANGE * SHOOT_RANGE)) {
            return;
        }

        const jitter = Math.floor((Math.random() * SHOOT_INACCURACY) - (SHOOT_INACCURACY / 2));
        const dx = target.x - (tank.offset.x + HALF_TILE);
        const dy = target.y - (tank.offset.y + HALF_TILE);
        let direction = vectorToDirection(dx, dy, tank.direction);
        direction = (direction + jitter) % 32;
        if (direction < 0) {
            direction += 32;
        }

        const vec = directionToVector(direction);
        const originX = (tank.offset.x + HALF_TILE) + (vec.dx * 30);
        const originY = (tank.offset.y + HALF_TILE) + (vec.dy * 30);

        this.game.bulletFactory.newBullet(tank.id, originX, originY, 0, -direction, null, {
            sourceType: 'rogue_tank',
            targetId: typeof target === 'object' ? target.id ?? null : null
        });
        this.emitTankShot(tank, originX, originY, direction);
        tank.fireCooldown = now + SHOOT_INTERVAL + Math.random() * 800;
    }

    tryDropBomb(tank, now) {
        if (now < tank.bombCooldown) {
            return;
        }

        const city = this.game.cities?.[tank.targetCityId];
        if (!city) {
            return;
        }
        if (!this.isCityOrbable(tank.targetCityId)) {
            return;
        }

        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
        const distSq = distanceSquared(tank.offset.x + HALF_TILE, tank.offset.y + HALF_TILE, centerX, centerY);
        if (distSq > (BOMB_DROP_RADIUS * BOMB_DROP_RADIUS)) {
            return;
        }

        const bomb = this.game.itemFactory?.newItem({ id: tank.id, city: null, armed: true }, tank.offset.x, tank.offset.y, ITEM_TYPE_BOMB, {
            notifyServer: false
        });

        if (!bomb) {
            tank.bombCooldown = now + BOMB_INTERVAL;
            return;
        }

        bomb.active = true;
        bomb.armed = true;
        const entry = {
            item: bomb,
            detonateAt: now + BOMB_FUSE + Math.random() * BOMB_FUSE_JITTER
        };
        tank.activeBombs.push(entry);
        tank.bombCooldown = now + BOMB_INTERVAL + Math.random() * BOMB_INTERVAL_JITTER;
        this.game.forceDraw = true;
    }

    updateBombs(tank, now) {
        if (!Array.isArray(tank.activeBombs) || !tank.activeBombs.length) {
            return;
        }
        const next = [];
        for (let i = 0; i < tank.activeBombs.length; i += 1) {
            const entry = tank.activeBombs[i];
            if (!entry || !entry.item) {
                continue;
            }
            if (now >= entry.detonateAt) {
                this.game.itemFactory.spawnExplosion(entry.item.x, entry.item.y);
                this.game.itemFactory.detonateBomb(entry.item, { notifyServer: false });
                continue;
            }
            next.push(entry);
        }
        tank.activeBombs = next;
    }

    resolveBulletKillDetails(bullet) {
        const details = {
            killerId: null,
            killerCallsign: null,
            sourceType: bullet && bullet.sourceType ? String(bullet.sourceType).toLowerCase() : null,
            hazardType: null
        };
        if (!bullet) {
            return details;
        }
        const candidates = [bullet.sourceId, bullet.shooter];
        for (let i = 0; i < candidates.length; i += 1) {
            const candidate = candidates[i];
            if (candidate === undefined || candidate === null) {
                continue;
            }
            const key = `${candidate}`;
            details.killerId = key;
            const callSign = (typeof this.game?.resolveCallsign === 'function')
                ? this.game.resolveCallsign(key)
                : null;
            if (callSign) {
                details.killerCallsign = callSign;
                break;
            }
        }
        if (typeof this.game?.describeKillSource === 'function') {
            details.killerLabel = this.game.describeKillSource(details);
        } else if (details.killerCallsign) {
            details.killerLabel = details.killerCallsign;
        } else {
            details.killerLabel = 'Unknown Forces';
        }
        return details;
    }

    announceRogueDeath(tank, details) {
        if (!tank || typeof this.game?.notify !== 'function') {
            return;
        }
        const victimLabel = tank.callsign
            || (typeof this.game?.resolveCallsign === 'function' ? this.game.resolveCallsign(tank.id) : null)
            || 'Rogue Tank';
        let killerLabel = details?.killerLabel;
        if (details && details.killerId && `${details.killerId}` === `${tank.id}`) {
            killerLabel = 'Self-Inflicted';
        }
        if ((!killerLabel || !killerLabel.trim().length) && typeof this.game?.describeKillSource === 'function') {
            killerLabel = this.game.describeKillSource(details || {});
        }
        if (!killerLabel || !killerLabel.trim().length) {
            killerLabel = 'Unknown Forces';
        }
        this.game.notify({
            title: 'Elimination',
            message: `${victimLabel} killed by ${killerLabel}.`,
            variant: 'warn',
            timeout: 5200
        });
    }

    handleBulletCollision(bullet, tank) {
        if (!tank) {
            return;
        }

        if (bullet.shooter && bullet.shooter === tank.id) {
            return;
        }

        const damage = Number.isFinite(bullet.damage) ? bullet.damage : 5;
        tank.health -= damage;

        if (tank.health <= 0) {
            const details = this.resolveBulletKillDetails(bullet);
            this.spawnTankExplosion(tank);
            this.announceRogueDeath(tank, details);
            this.removeTank(tank);
        }
    }

    spawnTankExplosion(tank) {
        if (!Array.isArray(this.game.explosions)) {
            return;
        }
        this.game.explosions.push({
            x: tank.offset.x,
            y: tank.offset.y,
            frame: 0,
            nextFrameTick: (this.game.tick || Date.now()) + 75,
            variant: 'small'
        });
    }

    removeTank(tank) {
        const index = this.tanks.indexOf(tank);
        if (index !== -1) {
            this.removeTankAtIndex(index);
        }
    }

    removeTankAtIndex(index) {
        const [tank] = this.tanks.splice(index, 1);
        if (tank && Array.isArray(tank.activeBombs)) {
            tank.activeBombs.forEach((entry) => {
                if (!entry || !entry.item) {
                    return;
                }
                this.game.itemFactory.deleteItem(entry.item);
            });
        }
        if (this.tanks.length === 0) {
            this.scheduleNextSpawn();
        }
        if (tank) {
            this.releaseCallsign(tank.id);
        }
        this.game.forceDraw = true;
    }

    scheduleNextSpawn() {
        const now = this.game.tick || Date.now();
        const delay = RESPAWN_BASE_DELAY + Math.random() * RESPAWN_DELAY_JITTER;
        this.nextAllowedSpawnTime = now + delay;
    }

    notifyCityUnderAttack(tank, cityId, cityCenter, engageRadius) {
        if (!tank || tank.notifiedAttack) {
            return;
        }
        const notify = this.game?.notify;
        if (typeof notify !== 'function') {
            return;
        }
        const cityName = getCityDisplayName(cityId);
        const direction = describeDirectionFromCity(
            cityCenter?.x ?? 0,
            cityCenter?.y ?? 0,
            tank.offset?.x ?? 0,
            tank.offset?.y ?? 0,
            Math.max(DIRECTION_THRESHOLD, (engageRadius || DIRECTION_THRESHOLD) * 0.25)
        );
        const message = direction
            ? `Rogue tank assaulting ${cityName} from the ${direction}.`
            : `Rogue tank assaulting ${cityName}.`;
        notify({
            title: 'Rogue Assault',
            message,
            variant: 'warn',
            timeout: 6500
        });
        tank.notifiedAttack = true;
    }

    getCityEngageRadius(cityId, now) {
        const cityKey = Number.isFinite(cityId) ? cityId : parseInt(cityId, 10);
        if (!Number.isFinite(cityKey)) {
            return ROGUE_ENGAGE_RADIUS;
        }
        const timestamp = Number.isFinite(now) ? now : (this.game.tick || Date.now());
        const cached = this.cityRadiusCache.get(cityKey);
        if (cached && (timestamp - cached.timestamp) < 4000) {
            return cached.radius;
        }
        const radius = this.computeCityEngageRadius(cityKey);
        this.cityRadiusCache.set(cityKey, {
            radius,
            timestamp
        });
        return radius;
    }

    computeCityEngageRadius(cityId) {
        if (!this.game?.buildingFactory || typeof this.game.buildingFactory.measureCityLayout !== 'function') {
            return ROGUE_ENGAGE_RADIUS;
        }
        const layout = this.game.buildingFactory.measureCityLayout(cityId);
        if (!layout) {
            return ROGUE_ENGAGE_RADIUS;
        }
        const rawRadius = Number.isFinite(layout.maxRadiusSq) && layout.maxRadiusSq > 0 ? Math.sqrt(layout.maxRadiusSq) : 0;
        if (!Number.isFinite(rawRadius) || rawRadius <= 0) {
            return ROGUE_ENGAGE_RADIUS;
        }
        return Math.max(ROGUE_ENGAGE_RADIUS, rawRadius + (TILE_SIZE * 4));
    }
}

export default RogueTankManager;
