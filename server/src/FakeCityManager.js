
"use strict";

const path = require('path');
const { spawn } = require('child_process');
const citySpawns = require('../../shared/citySpawns.json');
const fakeCityConfig = require('../../shared/fakeCities.json');
const CityFileLoader = require('./CityFileLoader');
const {
    TILE_SIZE,
    MAX_HEALTH,
    PLAYER_HITBOX_GAP,
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES
} = require('./gameplay/constants');
const { rectangleCollision } = require('./gameplay/geometry');
const { isCommandCenter, FACTORY_ITEM_LIMITS } = require('./constants');
const { ITEM_TYPES } = require('./items');

const DEFENSE_ITEM_TYPES = Object.freeze({
    wall: 8,
    turret: 9,
    turrets: 9,
    plasma: 11,
    'plasma_cannon': 11,
    'plasma cannon': 11,
    sleeper: 10,
    sleepers: 10,
    'sleeper_turret': 10,
    dfg: 7
});

const RECRUIT_DEFAULT_COUNT = 2;
const RECRUIT_RESPAWN_DELAY_MS = 45000;
const RECRUIT_THINK_INTERVAL_MS = 120;
const RECRUIT_TARGET_REFRESH_MS = 900;
const RECRUIT_SHOOT_INTERVAL_MS = 1400;
const RECRUIT_SHOOT_JITTER_MS = 400;
const RECRUIT_DETECTION_RADIUS = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE = TILE_SIZE * 18;
const RECRUIT_MAX_RANGE_SQUARED = RECRUIT_MAX_RANGE * RECRUIT_MAX_RANGE;
const RECRUIT_MUZZLE_OFFSET = (TILE_SIZE / 2) + 6;
const RECRUIT_PATROL_MARGIN_TILES = 2;
const RECRUIT_PATROL_SPEED = 0.24;
const RECRUIT_PATROL_POINT_THRESHOLD = TILE_SIZE * 0.75;
const RECRUIT_MAX_TICK_MS = 160;
const RECRUIT_SIMULATION_STEP_MS = 16;
const RECRUIT_MAX_SIM_STEPS = 12;
const MAP_SIZE_TILES = 512;
const MAP_PIXEL_SIZE = MAP_SIZE_TILES * TILE_SIZE;
const MAP_MAX_COORD = (MAP_PIXEL_SIZE) - TILE_SIZE;
const SPRITE_GAP = PLAYER_HITBOX_GAP;
const PLAYER_RECT_SIZE = TILE_SIZE - (SPRITE_GAP * 2);
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);
const RECRUIT_STUCK_TIMEOUT_MS = 5000;
const NAV_MAX_NODES = 3200;
const ARRIVE_RADIUS_PX = TILE_SIZE * 0.7;
const REPATH_STALL_MS = 650;
const LOS_RECHECK_MS = 300;
const PATH_REBUILD_COOLDOWN_MS = 350;
const OPTIMAL_RANGE_PX = TILE_SIZE * 12;
const KITE_RANGE_PX = TILE_SIZE * 16;
const BULLET_SPEED_PX_PER_S = TILE_SIZE * 28;
const AVOID_PROBE_PX = 20;
const SEPARATION_MIN_PX = 22;
const SEPARATION_STRENGTH = 0.75;
const PATH_WAYPOINT_REACH_PX = TILE_SIZE * 0.3;
const LAST_SEEN_TIMEOUT_MS = 2000;
const VISITED_TILE_LRU_SIZE = 10;
const FLANK_SAMPLE_ANGLES = Object.freeze([Math.PI / 2, -Math.PI / 2, Math.PI / 3, -Math.PI / 3]);
const RETREAT_HEALTH_FRACTION = 0.3;
const KITE_HEALTH_FRACTION = 0.55;
const FRIENDLY_FIRE_BUFFER_PX = TILE_SIZE * 0.5;
const PATH_MIN_DISTANCE_PX = TILE_SIZE * 4;
const AWARENESS_RESCAN_MS = 450;
const AWARENESS_RADIUS_PX = TILE_SIZE * 22;
const MAX_ALLY_SAMPLE = 6;
const MAX_REPATH_ATTEMPTS = 3;
const PATH_JITTER_PX = TILE_SIZE * 0.18;

const RECRUIT_POSITION_PATTERNS = Object.freeze([
    { dx: -TILE_SIZE, dy: TILE_SIZE / 2, direction: 16 },
    { dx: TILE_SIZE, dy: TILE_SIZE / 2, direction: 16 },
    { dx: -TILE_SIZE / 2, dy: -TILE_SIZE / 2, direction: 16 },
    { dx: TILE_SIZE / 2, dy: -TILE_SIZE / 2, direction: 16 },
]);

const DEFAULT_BOTS_PER_CITY = 2;
const MIN_ORBABLE_CITIES = 3;
const LOW_PLAYER_THRESHOLD = 20;
const CITIES_DATA_DIR = path.join(__dirname, '..', 'data', 'cities');

const clamp = (value, min, max) => {
    if (!Number.isFinite(value)) {
        return min;
    }
    if (value < min) {
        return min;
    }
    if (value > max) {
        return max;
    }
    return value;
};

const distanceSquared = (ax, ay, bx, by) => {
    const dx = ax - bx;
    const dy = ay - by;
    return (dx * dx) + (dy * dy);
};

const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return fallback;
    }
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq < 1e-4) {
        return fallback;
    }
    const length = Math.sqrt(lengthSq);
    const normX = dx / length;
    const normY = dy / length;
    const theta = Math.atan2(-normX, -normY);
    let direction = Math.round((-theta / Math.PI) * 16);
    direction %= 32;
    if (direction < 0) {
        direction += 32;
    }
    return direction;
};

const directionToUnitVector = (direction) => {
    if (!Number.isFinite(direction)) {
        return { x: 0, y: -1 };
    }
    const angle = (-direction / 16) * Math.PI;
    const x = Math.sin(angle) * -1;
    const y = Math.cos(angle) * -1;
    const length = Math.sqrt((x * x) + (y * y));
    if (length < 1e-4) {
        return { x: 0, y: -1 };
    }
    return {
        x: x / length,
        y: y / length
    };
};

const wrapDirection = (direction, fallback = 0) => {
    if (!Number.isFinite(direction)) {
        return ((Math.round(fallback) % 32) + 32) % 32;
    }
    return ((Math.round(direction) % 32) + 32) % 32;
};

const directionDelta = (from, to) => {
    const current = wrapDirection(from, 0);
    const target = wrapDirection(to, current);
    let diff = target - current;
    diff = ((diff + 16) % 32) - 16;
    return Math.abs(diff);
};

const stepDirectionTowards = (from, to, maxStep = 1) => {
    const current = wrapDirection(from, 0);
    const target = wrapDirection(to, current);
    let diff = target - current;
    diff = ((diff + 16) % 32) - 16;
    const bounded = Math.max(-Math.abs(maxStep), Math.min(Math.abs(maxStep), diff));
    return wrapDirection(current + bounded, current);
};

const rotateArray = (values, offset = 0) => {
    if (!Array.isArray(values) || !values.length) {
        return [];
    }
    const length = values.length;
    const normalized = ((Math.floor(offset) % length) + length) % length;
    if (normalized === 0) {
        return values.map((entry) => (entry ? { ...entry } : entry));
    }
    const result = [];
    for (let index = 0; index < length; index += 1) {
        const source = values[(index + normalized) % length];
        result.push(source ? { ...source } : source);
    }
    return result;
};

const createPatrolVariant = (basePath, options = {}) => {
    if (!Array.isArray(basePath) || !basePath.length) {
        return [];
    }
    const rotation = Number.isFinite(options.rotation) ? options.rotation : 0;
    const rotated = rotateArray(basePath, rotation);
    return rotated.map((point) => {
        const px = point?.x ?? 0;
        const py = point?.y ?? 0;
        return {
            x: clamp(px, 0, MAP_MAX_COORD),
            y: clamp(py, 0, MAP_MAX_COORD)
        };
    });
};

const toFiniteNumber = (value, fallback = 0) => {
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

const resolveBotsPerCity = (entry, config) => {
    const perEntry = entry ? toFiniteNumber(entry.botsPerCity, null) : null;
    const global = config ? toFiniteNumber(config.botsPerCity, null) : null;
    const desired = perEntry ?? global ?? DEFAULT_BOTS_PER_CITY;
    return Math.max(0, Math.round(desired));
};

const normalizeVector = (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return null;
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return null;
    }
    return {
        dx: dx / length,
        dy: dy / length
    };
};

const rotateVector = (vector, angle) => {
    if (!vector) {
        return null;
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = (vector.dx * cos) - (vector.dy * sin);
    const dy = (vector.dx * sin) + (vector.dy * cos);
    return normalizeVector(dx, dy);
};

const pixelToTile = (px, py) => ({
    x: clampTileIndex(px / TILE_SIZE),
    y: clampTileIndex(py / TILE_SIZE)
});

const tileToOffsetOrigin = (tileX, tileY) => ({
    x: clamp(tileX * TILE_SIZE, 0, MAP_MAX_COORD),
    y: clamp(tileY * TILE_SIZE, 0, MAP_MAX_COORD)
});

const seekArrive = (current, target, maxSpeedPxPerMs, arriveRadiusPx) => {
    if (!current || !target) {
        return null;
    }
    const dx = (target.x ?? 0) - (current.x ?? 0);
    const dy = (target.y ?? 0) - (current.y ?? 0);
    const distSq = (dx * dx) + (dy * dy);
    if (!Number.isFinite(distSq) || distSq < 1e-5) {
        return null;
    }
    let speed = maxSpeedPxPerMs;
    if (arriveRadiusPx > 0) {
        const dist = Math.sqrt(distSq);
        if (dist < arriveRadiusPx) {
            const scaled = maxSpeedPxPerMs * (dist / arriveRadiusPx);
            speed = Math.max(Math.min(maxSpeedPxPerMs, scaled), maxSpeedPxPerMs * 0.1);
        }
    }
    const dist = Math.sqrt(distSq);
    if (dist < 1e-5) {
        return null;
    }
    const scale = speed / dist;
    return {
        dx: dx * scale,
        dy: dy * scale
    };
};

const avoidanceAdjust = (position, velocity, maxSpeedPxPerMs, navGrid, isTileBlocked) => {
    if (!position || !velocity || !navGrid || typeof isTileBlocked !== 'function') {
        return velocity;
    }
    const speed = Math.sqrt((velocity.dx * velocity.dx) + (velocity.dy * velocity.dy));
    if (!Number.isFinite(speed) || speed < 1e-4) {
        return velocity;
    }
    const unit = {
        dx: velocity.dx / speed,
        dy: velocity.dy / speed
    };
    const probeDistance = Math.max(AVOID_PROBE_PX, maxSpeedPxPerMs * RECRUIT_SIMULATION_STEP_MS * 1.5);
    const forward = pixelToTile(position.x + (unit.dx * probeDistance), position.y + (unit.dy * probeDistance));
    if (!isTileBlocked(forward.x, forward.y)) {
        return velocity;
    }
    const checkBlocked = (vector) => {
        if (!vector) {
            return true;
        }
        const probeX = position.x + (vector.dx * probeDistance);
        const probeY = position.y + (vector.dy * probeDistance);
        const tile = pixelToTile(probeX, probeY);
        return isTileBlocked(tile.x, tile.y);
    };
    const left = rotateVector(unit, Math.PI / 4);
    const right = rotateVector(unit, -Math.PI / 4);
    const back = rotateVector(unit, Math.PI);
    const leftBlocked = checkBlocked(left);
    const rightBlocked = checkBlocked(right);
    let candidate = null;
    if (!leftBlocked && rightBlocked) {
        candidate = left;
    } else if (!rightBlocked && leftBlocked) {
        candidate = right;
    } else if (!leftBlocked && !rightBlocked) {
        candidate = Math.random() < 0.5 ? left : right;
    } else if (back) {
        candidate = back;
    }
    if (!candidate) {
        return velocity;
    }
    return {
        dx: candidate.dx * speed,
        dy: candidate.dy * speed
    };
};

const separationAdjust = (position, allies, maxSpeedPxPerMs) => {
    if (!position || !Array.isArray(allies) || !allies.length) {
        return { dx: 0, dy: 0 };
    }
    const sourceX = position.x + (TILE_SIZE / 2);
    const sourceY = position.y + (TILE_SIZE / 2);
    let totalDx = 0;
    let totalDy = 0;
    let totalWeight = 0;
    const minDistSq = SEPARATION_MIN_PX * SEPARATION_MIN_PX;
    for (const ally of allies) {
        if (!ally) {
            continue;
        }
        const dx = sourceX - ally.x;
        const dy = sourceY - ally.y;
        const distSq = (dx * dx) + (dy * dy);
        if (!Number.isFinite(distSq) || distSq <= 1e-5 || distSq > minDistSq) {
            continue;
        }
        const dist = Math.sqrt(distSq);
        const strength = (SEPARATION_MIN_PX - dist) / SEPARATION_MIN_PX;
        if (strength <= 0) {
            continue;
        }
        totalDx += (dx / dist) * strength;
        totalDy += (dy / dist) * strength;
        totalWeight += strength;
    }
    if (totalWeight <= 0) {
        return { dx: 0, dy: 0 };
    }
    const scale = (SEPARATION_STRENGTH * maxSpeedPxPerMs) / totalWeight;
    return {
        dx: totalDx * scale,
        dy: totalDy * scale
    };
};

const leadDirection = (shooter, target, bulletSpeedPxPerS, fallbackDirection = 16) => {
    if (!shooter || !target) {
        return fallbackDirection;
    }
    const shooterX = (shooter.offset?.x ?? shooter.x ?? 0) + (TILE_SIZE / 2);
    const shooterY = (shooter.offset?.y ?? shooter.y ?? 0) + (TILE_SIZE / 2);
    const targetX = (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2);
    const targetY = (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2);
    const dx = targetX - shooterX;
    const dy = targetY - shooterY;
    let vx = 0;
    let vy = 0;
    if (target.isMoving && Number.isFinite(target.direction)) {
        const vec = directionToUnitVector(target.direction);
        const targetSpeedPxPerMs = target.speed ?? (RECRUIT_PATROL_SPEED * 0.95);
        const targetSpeedPxPerS = targetSpeedPxPerMs * 1000;
        vx = vec.x * targetSpeedPxPerS;
        vy = vec.y * targetSpeedPxPerS;
    }
    const a = (vx * vx) + (vy * vy) - (bulletSpeedPxPerS * bulletSpeedPxPerS);
    const b = 2 * ((dx * vx) + (dy * vy));
    const c = (dx * dx) + (dy * dy);
    let t = 0;
    if (Math.abs(a) < 1e-6) {
        if (Math.abs(b) < 1e-6) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
        t = -c / b;
        if (t <= 0 || !Number.isFinite(t)) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
    } else {
        const discriminant = (b * b) - (4 * a * c);
        if (discriminant < 0) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
        const sqrt = Math.sqrt(discriminant);
        const t1 = (-b - sqrt) / (2 * a);
        const t2 = (-b + sqrt) / (2 * a);
        t = Math.min(t1, t2);
        if (t <= 0) {
            t = Math.max(t1, t2);
        }
        if (t <= 0 || !Number.isFinite(t)) {
            return vectorToDirection(dx, dy, fallbackDirection);
        }
    }
    const predictedX = targetX + (vx * t);
    const predictedY = targetY + (vy * t);
    return vectorToDirection(predictedX - shooterX, predictedY - shooterY, fallbackDirection);
};

const linePointDistanceSq = (ax, ay, bx, by, px, py) => {
    const abx = bx - ax;
    const aby = by - ay;
    const lengthSq = (abx * abx) + (aby * aby);
    if (lengthSq < 1e-6) {
        return distanceSquared(ax, ay, px, py);
    }
    let t = ((px - ax) * abx + (py - ay) * aby) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + (abx * t);
    const cy = ay + (aby * t);
    return distanceSquared(cx, cy, px, py);
};

const hasFriendlyObstruction = (shooterCenter, targetCenter, alliesCenters) => {
    if (!shooterCenter || !targetCenter || !Array.isArray(alliesCenters) || !alliesCenters.length) {
        return false;
    }
    const ax = shooterCenter.x;
    const ay = shooterCenter.y;
    const bx = targetCenter.x;
    const by = targetCenter.y;
    const lineLengthSq = distanceSquared(ax, ay, bx, by);
    if (lineLengthSq < 1e-6) {
        return false;
    }
    for (const ally of alliesCenters) {
        if (!ally) {
            continue;
        }
        const distSq = linePointDistanceSq(ax, ay, bx, by, ally.x, ally.y);
        if (distSq <= (FRIENDLY_FIRE_BUFFER_PX * FRIENDLY_FIRE_BUFFER_PX)) {
            const abx = bx - ax;
            const aby = by - ay;
            const projection = ((ally.x - ax) * abx + (ally.y - ay) * aby) / lineLengthSq;
            if (projection > 0 && projection < 1) {
                return true;
            }
        }
    }
    return false;
};

const pushVisitedTile = (record, tileX, tileY) => {
    if (!record || !Number.isFinite(tileX) || !Number.isFinite(tileY)) {
        return;
    }
    const key = `${tileX}_${tileY} `;
    if (!Array.isArray(record.visitedTiles)) {
        record.visitedTiles = [];
    }
    const existingIndex = record.visitedTiles.indexOf(key);
    if (existingIndex !== -1) {
        record.visitedTiles.splice(existingIndex, 1);
    }
    record.visitedTiles.push(key);
    if (record.visitedTiles.length > VISITED_TILE_LRU_SIZE) {
        record.visitedTiles.shift();
    }
};

const resolveBlueprintSize = (type) => {
    if (type === 0) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    // Default buildings occupy a 3x3 footprint in tile space
    return { width: 3, height: 3 };
};

const clampTileIndex = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(MAP_SIZE_TILES - 1, Math.floor(value)));
};

const calculateLayoutBounds = (layout, baseTileX, baseTileY) => {
    let minTileX = Number.isFinite(baseTileX) ? baseTileX : 0;
    let maxTileX = minTileX;
    let minTileY = Number.isFinite(baseTileY) ? baseTileY : 0;
    let maxTileY = minTileY;

    if (!Array.isArray(layout) || !layout.length) {
        return { minTileX, maxTileX, minTileY, maxTileY };
    }

    layout.forEach((blueprint) => {
        const dx = toFiniteNumber(blueprint?.dx, 0);
        const dy = toFiniteNumber(blueprint?.dy, 0);
        const resolvedX = Math.floor(baseTileX + dx);
        const resolvedY = Math.floor(baseTileY + dy);
        const { width, height } = resolveBlueprintSize(toFiniteNumber(blueprint?.type, null));
        minTileX = Math.min(minTileX, resolvedX);
        minTileY = Math.min(minTileY, resolvedY);
        maxTileX = Math.max(maxTileX, resolvedX + Math.max(0, width - 1));
        maxTileY = Math.max(maxTileY, resolvedY + Math.max(0, height - 1));
    });

    return { minTileX, maxTileX, minTileY, maxTileY };
};

const BLOCKING_TILE_VALUES = new Set([1, 2, 3]);

const isBlockingTileValue = (value) => {
    if (value === null || value === undefined) {
        return false;
    }
    if (BLOCKING_TILE_VALUES.has(value)) {
        return true;
    }
    return false;
};

const clampPixel = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value > MAP_PIXEL_SIZE - 1) {
        return MAP_PIXEL_SIZE - 1;
    }
    return value;
};

const createPlayerRectAt = (x, y) => ({
    x: Math.floor(x + SPRITE_GAP),
    y: Math.floor(y + SPRITE_GAP),
    w: PLAYER_RECT_SIZE,
    h: PLAYER_RECT_SIZE
});

const getBuildingFootprint = (building) => {
    if (!building) {
        return { width: 1, height: 1 };
    }
    const type = Number.isFinite(building.type) ? building.type : null;
    if (type !== null && isCommandCenter(type)) {
        return {
            width: COMMAND_CENTER_WIDTH_TILES,
            height: COMMAND_CENTER_HEIGHT_TILES
        };
    }
    return { width: 1, height: 1 };
};

const BUILDING_HITBOX_PADDING = TILE_SIZE * 0.2;

class FakeCityManager {
    constructor({ game, buildingFactory, playerFactory, hazardManager, defenseManager, bulletFactory, enabled = true }) {
        this.game = game;
        this.buildingFactory = buildingFactory;
        this.playerFactory = playerFactory;
        this.hazardManager = hazardManager || null;
        this.defenseManager = defenseManager || null;
        this.bulletFactory = bulletFactory || null;
        this.config = fakeCityConfig || {};
        this.activeCities = new Map();
        this.nextEvaluation = 0;
        this.io = null;
        this.defenseSequence = 0;
        this.botProcesses = new Map();
        this.recruits = new Map();
        this.recruitsByCity = new Map();
        this.navGrid = null;
        this.debug = require('debug')('BattleCity:FakeCityManager');
        this.disabled = !enabled;
        this.cityFileLayouts = new Map();

        if (this.disabled) {
            this.debug('[fake-city] manager disabled via configuration');
        } else {
            this.loadCityLayouts();
        }
    }

    getBotProcesses() {
        return this.botProcesses;
    }

    setIo(io) {
        this.io = io;
    }

    loadCityLayouts() {
        try {
            const spawnLookup = new Map();
            Object.values(citySpawns || {}).forEach((entry) => {
                if (!entry || !entry.name) {
                    return;
                }
                const key = String(entry.name).toLowerCase();
                spawnLookup.set(key, {
                    tileX: entry.tileX,
                    tileY: entry.tileY
                });
            });
            this.cityFileLayouts = CityFileLoader.loadCitiesFromDirectory(CITIES_DATA_DIR, spawnLookup);
            this.debug(`[fake - city] Loaded ${this.cityFileLayouts.size} city layouts from.city files`);
        } catch (error) {
            this.debug(`[fake - city] Failed to load city layouts: ${error.message} `);
            this.cityFileLayouts = new Map();
        }
    }

    update(now = Date.now(), options = {}) {
        if (this.disabled) {
            return;
        }
        const force = options.force === true;
        const interval = toFiniteNumber(this.config.evaluationIntervalMs, 10000);
        if (!force && now < this.nextEvaluation) {
            return;
        }
        this.nextEvaluation = now + interval;

        this.pruneInactiveCities();

        const humanCount = this.getHumanPlayerCount();
        const configured = this.getConfiguredCities();
        const maxActive = Math.min(configured.length, Math.max(0, toFiniteNumber(this.config.maxActive, configured.length)));

        // Calculate desired fake cities based on player count
        const minPlayers = Math.max(LOW_PLAYER_THRESHOLD, toFiniteNumber(this.config.minPlayers, LOW_PLAYER_THRESHOLD));
        const underThreshold = humanCount < minPlayers;
        let desired = underThreshold ? maxActive : 0;

        // Solo player feature: spawn nearby city if only one human player
        if (humanCount === 1 && this.activeCities.size === 0) {
            const players = Object.values(this.game?.players || {});
            const soloPlayer = players.find(p => p && !p.isBot);
            if (soloPlayer && Number.isFinite(soloPlayer.city)) {
                this.spawnNearbyCityForPlayer(soloPlayer.city);
            }
        }

        // Ensure we always have minimum orbable cities
        const orbableCount = this.getOrbableCityCount();
        if (orbableCount < MIN_ORBABLE_CITIES) {
            const needed = MIN_ORBABLE_CITIES - orbableCount;
            desired = Math.max(desired, Math.min(needed, maxActive));
            this.debug(`[fake - city] Only ${orbableCount} orbable cities, spawning ${needed} more`);
        }

        if (desired > this.activeCities.size) {
            this.spawnFakeCities(desired - this.activeCities.size, configured);
        } else if (desired < this.activeCities.size) {
            this.removeFakeCities(this.activeCities.size - desired);
        }
    }

    onCityOrbed(event = {}) {
        const targetCityId = toFiniteNumber(event?.targetCityId ?? event?.targetCity, null);
        if (targetCityId === null || !this.activeCities.has(targetCityId)) {
            return;
        }
        this.debug(`[fake-city] City ${targetCityId} orbed; refreshing fake roster`);
        this.despawnFakeCity(targetCityId);
        this.nextEvaluation = 0;
        this.update(Date.now(), { force: true });
    }

    pruneInactiveCities() {
        const cityManager = this.buildingFactory?.cityManager;
        if (!cityManager || !this.activeCities.size) {
            return 0;
        }
        let removed = 0;
        for (const cityId of Array.from(this.activeCities.keys())) {
            const city = cityManager.getCity(cityId);
            const stillFake = !!city?.isFake;
            const isOrbable = cityManager.isOrbable(cityId);
            if (!stillFake || !isOrbable) {
                if (this.despawnFakeCity(cityId)) {
                    removed += 1;
                }
            }
        }
        return removed;
    }

    /**
     * Get count of currently orbable fake cities
     * @returns {number} - Number of orbable fake cities
     */
    getOrbableCityCount() {
        const cityManager = this.buildingFactory?.cityManager;
        if (!cityManager) {
            return 0;
        }

        let count = 0;
        for (const cityId of this.activeCities.keys()) {
            if (cityManager.isOrbable(cityId)) {
                count++;
            }
        }
        return count;
    }

    /**
     * Spawn a fake city near a player's location (for solo player experience)
     * @param {number} playerCityId - The player's current city ID
     */
    spawnNearbyCityForPlayer(playerCityId) {
        if (!Number.isFinite(playerCityId)) {
            return false;
        }

        const playerSpawn = citySpawns?.[String(playerCityId)];
        if (!playerSpawn) {
            return false;
        }

        const configured = this.getConfiguredCities();
        const available = configured.filter((entry) => !this.activeCities.has(toFiniteNumber(entry.cityId)));

        if (available.length === 0) {
            return false;
        }

        // Find nearest available city
        let nearestCity = null;
        let nearestDistance = Infinity;

        for (const entry of available) {
            const cityId = toFiniteNumber(entry.cityId, null);
            if (cityId === null) continue;

            const spawn = citySpawns?.[String(cityId)];
            if (!spawn) continue;

            const dx = (spawn.tileX || 0) - (playerSpawn.tileX || 0);
            const dy = (spawn.tileY || 0) - (playerSpawn.tileY || 0);
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0 && distance < nearestDistance) {
                nearestDistance = distance;
                nearestCity = entry;
            }
        }

        if (nearestCity && this.spawnFakeCity(nearestCity)) {
            this.debug(`[fake - city] Spawned nearby city ${nearestCity.cityId} for solo player at city ${playerCityId} `);
            return true;
        }

        return false;
    }

    spawnBotInCity(cityId, desiredCount = null) {
        this.debug(`[bot] server-side defenders disabled; ignoring spawn request for city ${cityId} (desired=${desiredCount})`);
        return 0;
    }


    getHumanPlayerCount() {
        const players = this.game?.players || {};
        let count = 0;
        for (const player of Object.values(players)) {
            if (!player) {
                continue;
            }
            if (player.isFake) {
                continue;
            }
            if (player.isSpectator) {
                continue;
            }
            count += 1;
        }
        const botProcessCount = Array.from(this.botProcesses.values())
            .reduce((acc, processes) => {
                if (!processes) {
                    return acc;
                }
                if (processes instanceof Set) {
                    return acc + processes.size;
                }
                if (Array.isArray(processes)) {
                    return acc + processes.length;
                }
                return acc + 1;
            }, 0);
        return Math.max(0, count - botProcessCount);
    }

    getConfiguredCities() {
        const entries = Array.isArray(this.config.cities) ? this.config.cities : [];
        return entries.filter((entry) => Number.isFinite(toFiniteNumber(entry?.cityId, NaN)));
    }

    findCityConfig(cityId) {
        if (!Number.isFinite(cityId)) {
            return null;
        }
        const numericCity = Math.max(0, Math.floor(cityId));
        return this.getConfiguredCities().find((entry) => toFiniteNumber(entry?.cityId, null) === numericCity) || null;
    }

    resolveDesiredBotCount(cityId, entry = null) {
        const resolvedEntry = entry || this.findCityConfig(cityId);
        return resolveBotsPerCity(resolvedEntry, this.config);
    }

    updateCityBotCapacityMetadata(cityId, desiredCount, entry = null) {
        if (!Number.isFinite(cityId)) {
            return;
        }
        const numericCity = Math.max(0, Math.floor(cityId));
        const desired = Number.isFinite(desiredCount) ? Math.max(0, Math.floor(desiredCount)) : 0;
        const configEntry = entry || this.findCityConfig(numericCity);
        const overrideMayorSlots = Number.isFinite(toFiniteNumber(configEntry?.mayorSlots, null))
            ? Math.max(0, Math.floor(configEntry.mayorSlots))
            : null;
        const overrideRecruitSlots = Number.isFinite(toFiniteNumber(configEntry?.recruitSlots, null))
            ? Math.max(0, Math.floor(configEntry.recruitSlots))
            : null;
        const mayorSlots = desired > 0 ? 1 : 0;
        const recruitCapacity = Math.max(0, desired - mayorSlots);
        const resolvedMayorSlots = overrideMayorSlots !== null ? overrideMayorSlots : mayorSlots;
        const resolvedRecruitCapacity = overrideRecruitSlots !== null
            ? overrideRecruitSlots
            : recruitCapacity;
        const cityManager = this.buildingFactory?.cityManager;
        if (!cityManager) {
            return;
        }
        const cityState = cityManager.ensureCity(numericCity);
        if (!cityState) {
            return;
        }
        cityState.fakeBotMayorSlots = resolvedMayorSlots;
        cityState.fakeBotRecruitCapacity = resolvedRecruitCapacity;
    }

    ensureCityBotCount(_cityId, _desiredCount = DEFAULT_BOTS_PER_CITY) {
        return 0;
    }

    buildPatrolPath(entry, baseTileX, baseTileY, layout) {
        let resolvedLayout = [];
        if (Array.isArray(layout) && layout.length) {
            resolvedLayout = layout;
        } else if (Array.isArray(entry?.layout) && entry.layout.length) {
            resolvedLayout = entry.layout;
        } else if (Array.isArray(this.config.layout)) {
            resolvedLayout = this.config.layout;
        }

        const bounds = calculateLayoutBounds(resolvedLayout, baseTileX, baseTileY);
        const margin = Math.max(0, toFiniteNumber(entry?.patrolMarginTiles, RECRUIT_PATROL_MARGIN_TILES));

        const leftTile = clampTileIndex(bounds.minTileX - margin);
        const rightTile = clampTileIndex(bounds.maxTileX + margin);
        const topTile = clampTileIndex(bounds.minTileY - margin);
        const bottomTile = clampTileIndex(bounds.maxTileY + margin);

        if (leftTile >= rightTile || topTile >= bottomTile) {
            return [];
        }

        const candidatePoints = [
            { x: clamp(leftTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(topTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(rightTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(topTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(rightTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(bottomTile * TILE_SIZE, 0, MAP_MAX_COORD) },
            { x: clamp(leftTile * TILE_SIZE, 0, MAP_MAX_COORD), y: clamp(bottomTile * TILE_SIZE, 0, MAP_MAX_COORD) }
        ];

        const path = [];
        candidatePoints.forEach((point) => {
            if (!point) {
                return;
            }
            const last = path[path.length - 1];
            if (!last || last.x !== point.x || last.y !== point.y) {
                path.push(point);
            }
        });

        if (path.length >= 3) {
            const first = path[0];
            const last = path[path.length - 1];
            if (first.x === last.x && first.y === last.y) {
                path.pop();
            }
        }

        return path;
    }

    getPatrolPathForCity(cityId) {
        if (!Number.isFinite(cityId)) {
            return [];
        }
        const record = this.activeCities.get(cityId);
        if (!record) {
            return [];
        }
        const path = Array.isArray(record.patrolPath) ? record.patrolPath : [];
        return path.length ? path : [];
    }

    ensureRecruitPatrolState(record) {
        if (!record) {
            return;
        }
        const basePath = this.getPatrolPathForCity(record.cityId);
        if (!Array.isArray(basePath) || !basePath.length) {
            record.patrolVariant = [];
            record.patrolIndex = 0;
            return;
        }
        if (record.patrolDirection !== 1 && record.patrolDirection !== -1) {
            record.patrolDirection = Math.random() < 0.5 ? -1 : 1;
        }
        if (!Number.isFinite(record.patrolThreshold)) {
            record.patrolThreshold = RECRUIT_PATROL_POINT_THRESHOLD;
        }
        if (!Number.isFinite(record.patrolStopDistance)) {
            record.patrolStopDistance = TILE_SIZE * 0.6;
        }
        if (!Array.isArray(record.patrolVariant) || record.patrolVariant.length !== basePath.length) {
            const rotation = Math.floor(Math.random() * basePath.length);
            record.patrolVariant = createPatrolVariant(basePath, { rotation });
            record.patrolIndex = 0;
        }
        const length = record.patrolVariant.length;
        if (length) {
            const normalized = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
            record.patrolIndex = ((normalized % length) + length) % length;
        } else {
            record.patrolIndex = 0;
        }
    }

    getRecruitPatrolPath(record) {
        if (!record) {
            return [];
        }
        this.ensureRecruitPatrolState(record);
        if (Array.isArray(record.patrolVariant) && record.patrolVariant.length) {
            return record.patrolVariant;
        }
        return this.getPatrolPathForCity(record.cityId);
    }

    selectPatrolIndexForTarget(record, targetX, targetY) {
        if (!record) {
            return null;
        }
        const path = this.getRecruitPatrolPath(record);
        if (!Array.isArray(path) || !path.length) {
            return null;
        }
        const length = path.length;
        const currentIndex = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
        const baseIndex = ((currentIndex % length) + length) % length;
        const basePoint = path[baseIndex];
        if (!basePoint) {
            return null;
        }
        let bestIndex = baseIndex;
        let bestDistance = distanceSquared(basePoint.x ?? 0, basePoint.y ?? 0, targetX, targetY);
        let bestDirection = (record.patrolDirection === -1) ? -1 : 1;
        const searchRadius = Math.min(Math.max(2, Math.ceil(length / 4)), Math.max(2, length - 1));
        const improvementThreshold = (TILE_SIZE * TILE_SIZE) * 0.3;

        for (let offset = -searchRadius; offset <= searchRadius; offset += 1) {
            if (offset === 0) {
                continue;
            }
            const candidateIndex = (baseIndex + offset + length) % length;
            const point = path[candidateIndex];
            if (!point) {
                continue;
            }
            const distSq = distanceSquared(point.x ?? 0, point.y ?? 0, targetX, targetY);
            if (distSq + improvementThreshold < bestDistance) {
                bestDistance = distSq;
                bestIndex = candidateIndex;
                bestDirection = offset > 0 ? 1 : -1;
            }
        }

        return {
            index: bestIndex,
            direction: bestDirection,
            point: path[bestIndex]
        };
    }

    getMapValue(tileX, tileY) {
        const map = this.game?.map;
        if (!Array.isArray(map) || !Array.isArray(map[0])) {
            return 0;
        }
        if (tileX < 0 || tileY < 0 || tileX >= MAP_SIZE_TILES || tileY >= MAP_SIZE_TILES) {
            return 0;
        }
        const column = map[tileX];
        if (!Array.isArray(column)) {
            return 0;
        }
        const value = column[tileY];
        if (value === undefined || value === null) {
            return 0;
        }
        return value;
    }

    hitsEdges(rect) {
        if (!rect) {
            return true;
        }
        if (rect.x < 0 || rect.y < 0) {
            return true;
        }
        if ((rect.x + rect.w) > MAP_PIXEL_SIZE) {
            return true;
        }
        if ((rect.y + rect.h) > MAP_PIXEL_SIZE) {
            return true;
        }
        return false;
    }

    hitsBlockingTile(rect) {
        if (!rect) {
            return false;
        }
        const startTileX = Math.max(0, Math.floor(rect.x / TILE_SIZE));
        const endTileX = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
        const startTileY = Math.max(0, Math.floor(rect.y / TILE_SIZE));
        const endTileY = Math.min(MAP_SIZE_TILES - 1, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));

        for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
            for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
                const value = this.getMapValue(tileX, tileY);
                if (isBlockingTileValue(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    hitsBuildings(rect) {
        if (!rect) {
            return false;
        }
        const factory = this.buildingFactory;
        if (!factory || !factory.buildings || typeof factory.buildings.values !== 'function') {
            return false;
        }
        for (const building of factory.buildings.values()) {
            if (!building) {
                continue;
            }
            const tileX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
            const tileY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
            if (tileX === null || tileY === null) {
                continue;
            }
            const footprint = getBuildingFootprint(building);
            const width = Math.max(1, Number.isFinite(footprint.width) ? footprint.width : 1);
            const height = Math.max(1, Number.isFinite(footprint.height) ? footprint.height : 1);
            const padding = BUILDING_HITBOX_PADDING;
            const buildingRect = {
                x: (tileX * TILE_SIZE) + padding,
                y: (tileY * TILE_SIZE) + padding,
                w: Math.max(TILE_SIZE * width - (padding * 2), TILE_SIZE * 0.5),
                h: Math.max(TILE_SIZE * height - (padding * 2), TILE_SIZE * 0.5)
            };
            if (rectangleCollision(rect, buildingRect)) {
                return true;
            }
        }
        return false;
    }

    isBlocked(x, y) {
        const rect = createPlayerRectAt(clampPixel(x), clampPixel(y));
        if (this.hitsEdges(rect)) {
            return true;
        }
        if (this.hitsBlockingTile(rect)) {
            return true;
        }
        if (this.hitsBuildings(rect)) {
            return true;
        }
        return false;
    }

    ensureSpawnIsClear(spawn) {
        if (!spawn) {
            return spawn;
        }
        if (!this.isBlocked(spawn.x, spawn.y)) {
            return spawn;
        }
        this.debug(`[recruit fallback] spawn blocked at(${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) searching alternatives`);
        const radii = [TILE_SIZE, TILE_SIZE * 2, TILE_SIZE * 3, TILE_SIZE * 4];
        const directions = [
            { dx: 1, dy: 0 }, { dx: -1, dy: 0 }, { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
            { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 }
        ];
        for (const radius of radii) {
            for (const dir of directions) {
                const candidateX = clamp(spawn.x + dir.dx * radius, 0, MAP_MAX_COORD);
                const candidateY = clamp(spawn.y + dir.dy * radius, 0, MAP_MAX_COORD);
                if (!this.isBlocked(candidateX, candidateY)) {
                    this.debug(`[recruit fallback] spawn moved to(${candidateX.toFixed(1)}, ${candidateY.toFixed(1)})`);
                    return Object.assign({}, spawn, { x: candidateX, y: candidateY });
                }
            }
        }
        return spawn;
    }

    tryMoveWithVector(px, py, vector, step) {
        if (!vector) {
            return null;
        }
        const nextX = clamp(px + (vector.dx * step), 0, MAP_MAX_COORD);
        const nextY = clamp(py + (vector.dy * step), 0, MAP_MAX_COORD);
        if (this.isBlocked(nextX, nextY)) {
            return null;
        }
        const direction = vectorToDirection(vector.dx, vector.dy, 16);
        return {
            x: nextX,
            y: nextY,
            vector,
            direction
        };
    }

    findAlternateVector(baseVector, px, py, step) {
        if (!baseVector) {
            return null;
        }
        for (let index = 0; index < AVOIDANCE_ANGLES.length; index += 1) {
            const rotated = rotateVector(baseVector, AVOIDANCE_ANGLES[index]);
            if (!rotated) {
                continue;
            }
            const attempt = this.tryMoveWithVector(px, py, rotated, step);
            if (attempt) {
                return attempt;
            }
        }
        return null;
    }

    buildNavGrid(force = false) {
        if (!force && this.navGrid) {
            return this.navGrid;
        }
        const width = MAP_SIZE_TILES;
        const height = MAP_SIZE_TILES;
        const total = width * height;
        const tiles = new Uint8Array(total);
        const markBlocked = (tileX, tileY) => {
            if (tileX < 0 || tileY < 0 || tileX >= width || tileY >= height) {
                return;
            }
            tiles[(tileY * width) + tileX] = 1;
        };

        for (let tileX = 0; tileX < width; tileX += 1) {
            for (let tileY = 0; tileY < height; tileY += 1) {
                const value = this.getMapValue(tileX, tileY);
                if (isBlockingTileValue(value)) {
                    markBlocked(tileX, tileY);
                }
            }
        }

        const factory = this.buildingFactory;
        if (factory && factory.buildings && typeof factory.buildings.values === 'function') {
            for (const building of factory.buildings.values()) {
                if (!building) {
                    continue;
                }
                const baseX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
                const baseY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
                if (baseX === null || baseY === null) {
                    continue;
                }
                const { width: footprintW, height: footprintH } = getBuildingFootprint(building);
                const w = Math.max(1, Number.isFinite(footprintW) ? footprintW : 1);
                const h = Math.max(1, Number.isFinite(footprintH) ? footprintH : 1);
                for (let dx = 0; dx < w; dx += 1) {
                    for (let dy = 0; dy < h; dy += 1) {
                        markBlocked(baseX + dx, baseY + dy);
                    }
                }
            }
        }

        this.navGrid = {
            width,
            height,
            tiles
        };
        return this.navGrid;
    }

    isNavTileBlocked(tileX, tileY) {
        if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
            return true;
        }
        const nav = this.navGrid || this.buildNavGrid();
        if (!nav) {
            return true;
        }
        if (tileX < 0 || tileY < 0 || tileX >= nav.width || tileY >= nav.height) {
            return true;
        }
        return nav.tiles[(tileY * nav.width) + tileX] === 1;
    }

    losTileRaycast(ax, ay, bx, by) {
        const nav = this.navGrid || this.buildNavGrid();
        if (!nav) {
            return false;
        }
        const start = pixelToTile(ax, ay);
        const end = pixelToTile(bx, by);
        let x = start.x;
        let y = start.y;
        const dx = Math.abs(end.x - x);
        const dy = Math.abs(end.y - y);
        const sx = x < end.x ? 1 : -1;
        const sy = y < end.y ? 1 : -1;
        let err = dx - dy;

        while (true) {
            if (!(x === start.x && y === start.y)) {
                if (this.isNavTileBlocked(x, y)) {
                    return false;
                }
            }
            if (x === end.x && y === end.y) {
                break;
            }
            const e2 = err * 2;
            if (e2 > -dy) {
                err -= dy;
                x += sx;
            }
            if (e2 < dx) {
                err += dx;
                y += sy;
            }
        }

        return true;
    }

    astar(start, goal, nav = this.navGrid, options = {}) {
        if (!nav) {
            return null;
        }
        const visitedPenalty = options.visitedPenalty instanceof Set ? options.visitedPenalty : null;
        const startKey = `${start.x}_${start.y} `;
        const open = [];
        const openMap = new Map();
        const cameFrom = new Map();
        const gScore = new Map();
        const heuristic = (x, y) => Math.abs(x - goal.x) + Math.abs(y - goal.y);
        const maxNodes = options.maxNodes ?? NAV_MAX_NODES;

        const pushNode = (node) => {
            open.push(node);
            openMap.set(`${node.x}_${node.y} `, node);
        };

        const popLowest = () => {
            let bestIndex = -1;
            let bestNode = null;
            for (let index = 0; index < open.length; index += 1) {
                const candidate = open[index];
                if (!bestNode || candidate.f < bestNode.f) {
                    bestNode = candidate;
                    bestIndex = index;
                }
            }
            if (bestIndex === -1) {
                return null;
            }
            open.splice(bestIndex, 1);
            openMap.delete(`${bestNode.x}_${bestNode.y} `);
            return bestNode;
        };

        pushNode({ x: start.x, y: start.y, g: 0, f: heuristic(start.x, start.y) });
        gScore.set(startKey, 0);
        let expansions = 0;

        while (open.length && expansions < maxNodes) {
            const current = popLowest();
            if (!current) {
                break;
            }
            const currentKey = `${current.x}_${current.y} `;
            if (current.x === goal.x && current.y === goal.y) {
                const path = [];
                let walkerKey = currentKey;
                while (walkerKey && walkerKey !== startKey) {
                    const [px, py] = walkerKey.split('_').map(Number);
                    path.push({ x: px, y: py });
                    walkerKey = cameFrom.get(walkerKey);
                }
                path.reverse();
                if (path.length && path[0].x === start.x && path[0].y === start.y) {
                    path.shift();
                }
                return path;
            }

            expansions += 1;
            const neighbors = [
                { x: current.x + 1, y: current.y },
                { x: current.x - 1, y: current.y },
                { x: current.x, y: current.y + 1 },
                { x: current.x, y: current.y - 1 }
            ];

            for (const neighbor of neighbors) {
                if (neighbor.x < 0 || neighbor.y < 0 || neighbor.x >= nav.width || neighbor.y >= nav.height) {
                    continue;
                }
                if (this.isNavTileBlocked(neighbor.x, neighbor.y)) {
                    continue;
                }
                const neighborKey = `${neighbor.x}_${neighbor.y} `;
                const penalty = visitedPenalty && visitedPenalty.has(neighborKey) ? 6 : 0;
                const tentativeG = current.g + 1 + penalty;
                const existingG = gScore.get(neighborKey);
                if (existingG !== undefined && tentativeG >= existingG) {
                    continue;
                }
                cameFrom.set(neighborKey, currentKey);
                gScore.set(neighborKey, tentativeG);
                const fScore = tentativeG + heuristic(neighbor.x, neighbor.y);
                const existingNode = openMap.get(neighborKey);
                if (existingNode) {
                    existingNode.g = tentativeG;
                    existingNode.f = fScore;
                } else {
                    pushNode({ x: neighbor.x, y: neighbor.y, g: tentativeG, f: fScore });
                }
            }
        }

        return null;
    }

    pickMode(context) {
        const hasTarget = !!context.target;
        const hasRecentSeen = context.lastSeenAge !== undefined && context.lastSeenAge <= LAST_SEEN_TIMEOUT_MS;
        const rangePx = Number.isFinite(context.rangePx) ? context.rangePx : Infinity;
        const hpFrac = Number.isFinite(context.hpFrac) ? context.hpFrac : 1;
        const targetHpFrac = Number.isFinite(context.targetHpFrac) ? context.targetHpFrac : 1;
        const outnumbered = !!context.outnumbered;

        if (!hasTarget && !hasRecentSeen) {
            return 'patrol';
        }
        if ((hpFrac <= RETREAT_HEALTH_FRACTION) || (outnumbered && hpFrac < 0.6)) {
            return 'retreat';
        }
        if (!context.hasLOS) {
            if (hasRecentSeen) {
                return 'flank';
            }
            return 'patrol';
        }
        if (hpFrac < KITE_HEALTH_FRACTION && (targetHpFrac > hpFrac || rangePx < OPTIMAL_RANGE_PX * 0.8)) {
            return 'kite';
        }
        if (rangePx > OPTIMAL_RANGE_PX * 1.3) {
            return 'engage';
        }
        if (rangePx < OPTIMAL_RANGE_PX * 0.7) {
            return 'kite';
        }
        return 'engage';
    }

    computeGoalTile(options) {
        const { mode, record, player, target, hasLOS, rangePx, lastSeen } = options;
        const px = player.offset?.x ?? 0;
        const py = player.offset?.y ?? 0;
        const shooterCenter = {
            x: px + (TILE_SIZE / 2),
            y: py + (TILE_SIZE / 2)
        };
        const spawn = record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0);

        const makeGoal = (desiredX, desiredY, requiresPathOverride = null) => {
            const tx = clampTileIndex(desiredX / TILE_SIZE);
            const ty = clampTileIndex(desiredY / TILE_SIZE);
            const targetX = clamp(desiredX, 0, MAP_MAX_COORD);
            const targetY = clamp(desiredY, 0, MAP_MAX_COORD);
            const requiresPath = requiresPathOverride !== null
                ? requiresPathOverride
                : this.isBlocked(targetX, targetY);
            return {
                goalTileX: tx,
                goalTileY: ty,
                goalPixelX: targetX,
                goalPixelY: targetY,
                requiresPath
            };
        };

        let targetCenter = null;
        if (target) {
            targetCenter = {
                x: (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2),
                y: (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2)
            };
        }

        if (mode === 'patrol') {
            const fallbackDirection = wrapDirection(player.direction ?? 16);
            const patrol = this.resolveRecruitPatrol(record, px, py, fallbackDirection);
            if (patrol && patrol.point) {
                const distance = Math.sqrt(distanceSquared(px, py, patrol.point.x, patrol.point.y));
                const requiresPath = distance > TILE_SIZE * 1.5 || this.isBlocked(patrol.point.x, patrol.point.y);
                return makeGoal(patrol.point.x, patrol.point.y, requiresPath);
            }
            if (spawn) {
                return makeGoal(clamp(spawn.x, 0, MAP_MAX_COORD), clamp(spawn.y, 0, MAP_MAX_COORD), false);
            }
            return null;
        }

        if ((mode === 'engage' || mode === 'kite' || mode === 'retreat') && (targetCenter || lastSeen)) {
            const reference = targetCenter || {
                x: clamp(lastSeen?.x ?? shooterCenter.x, 0, MAP_PIXEL_SIZE),
                y: clamp(lastSeen?.y ?? shooterCenter.y, 0, MAP_PIXEL_SIZE)
            };
            const directionVector = normalizeVector(shooterCenter.x - reference.x, shooterCenter.y - reference.y) || { dx: 0, dy: -1 };
            const desiredRange = mode === 'engage'
                ? OPTIMAL_RANGE_PX
                : KITE_RANGE_PX;
            let desiredCenterX = reference.x + (directionVector.dx * desiredRange);
            let desiredCenterY = reference.y + (directionVector.dy * desiredRange);

            if (mode === 'retreat' && spawn) {
                desiredCenterX = (desiredCenterX * 0.6) + ((spawn.x + (TILE_SIZE / 2)) * 0.4);
                desiredCenterY = (desiredCenterY * 0.6) + ((spawn.y + (TILE_SIZE / 2)) * 0.4);
            }

            const desiredX = clamp(desiredCenterX - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
            const desiredY = clamp(desiredCenterY - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
            const requiresPath = !hasLOS || this.isBlocked(desiredX, desiredY) || rangePx > desiredRange * 1.4;
            return makeGoal(desiredX, desiredY, requiresPath);
        }

        if (mode === 'flank' && (targetCenter || lastSeen)) {
            const reference = targetCenter || {
                x: clamp(lastSeen?.x ?? shooterCenter.x, 0, MAP_PIXEL_SIZE),
                y: clamp(lastSeen?.y ?? shooterCenter.y, 0, MAP_PIXEL_SIZE)
            };
            const baseVector = normalizeVector(shooterCenter.x - reference.x, shooterCenter.y - reference.y) || { dx: 0, dy: -1 };
            let best = null;

            FLANK_SAMPLE_ANGLES.forEach((angle) => {
                const rotated = rotateVector(baseVector, angle);
                if (!rotated) {
                    return;
                }
                const desiredCenterX = reference.x + (rotated.dx * OPTIMAL_RANGE_PX);
                const desiredCenterY = reference.y + (rotated.dy * OPTIMAL_RANGE_PX);
                const desiredX = clamp(desiredCenterX - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
                const desiredY = clamp(desiredCenterY - (TILE_SIZE / 2), 0, MAP_MAX_COORD);
                const los = this.losTileRaycast(desiredCenterX, desiredCenterY, reference.x, reference.y);
                const requiresPath = !los || this.isBlocked(desiredX, desiredY);
                const score = (requiresPath ? 5 : 0) + (los ? 0 : 10) + (distanceSquared(desiredX, desiredY, px, py) / 10000);
                if (!best || score < best.score) {
                    best = {
                        goalTileX: clampTileIndex(desiredX / TILE_SIZE),
                        goalTileY: clampTileIndex(desiredY / TILE_SIZE),
                        goalPixelX: desiredX,
                        goalPixelY: desiredY,
                        requiresPath,
                        score
                    };
                }
            });

            if (best) {
                return {
                    goalTileX: best.goalTileX,
                    goalTileY: best.goalTileY,
                    goalPixelX: best.goalPixelX,
                    goalPixelY: best.goalPixelY,
                    requiresPath: best.requiresPath
                };
            }
        }

        if (spawn) {
            return makeGoal(clamp(spawn.x, 0, MAP_MAX_COORD), clamp(spawn.y, 0, MAP_MAX_COORD), false);
        }
        return null;
    }

    resetRecruitPosition(record, player, now = Date.now()) {
        if (!record || !player) {
            return false;
        }
        let spawn = record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0);
        if (!spawn) {
            return false;
        }
        spawn = this.ensureSpawnIsClear(spawn);
        record.spawn = spawn;
        player.offset.x = spawn.x;
        player.offset.y = spawn.y;
        if (spawn.direction !== undefined) {
            player.direction = spawn.direction;
        }
        player.sequence = (player.sequence || 0) + 1;
        player.isMoving = 0;
        record.mode = 'patrol';
        record.targetId = null;
        record.patrolIndex = 0;
        record.patrolDirection = 1;
        record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS;
        record.lastMoveTimestamp = now;
        record.stuckCounter = 0;
        record.path = null;
        record.pathIndex = 0;
        record.lastPathBuildAt = 0;
        record.pathGoalKey = null;
        record.lastProgressAt = now;
        record.nextLosCheckAt = now;
        record.lastLosResult = false;
        record.visitedTiles = [];
        record.lastSeenTargetAt = 0;
        record.lastSeenX = null;
        record.lastSeenY = null;
        record.nextAwarenessScanAt = now;
        record.cachedAllyCenters = [];
        record.cachedAllies = 0;
        record.cachedEnemies = 0;
        record.repathAttempts = 0;
        record.motionSeed = Number.isFinite(record.motionSeed) ? record.motionSeed : Math.random();
        record.lastMoveX = spawn.x;
        record.lastMoveY = spawn.y;
        this.ensureRecruitPatrolState(record);
        return true;
    }

    resolveRecruitPatrol(record, px, py, fallbackDirection = 16) {
        if (!record) {
            return null;
        }
        const path = this.getRecruitPatrolPath(record);
        if (!path.length) {
            return null;
        }
        const threshold = record.patrolThreshold ?? RECRUIT_PATROL_POINT_THRESHOLD;
        const thresholdSq = threshold * threshold;
        const length = path.length;
        let index = Number.isFinite(record.patrolIndex) ? Math.floor(record.patrolIndex) : 0;
        if (length <= 0) {
            return null;
        }
        index = ((index % length) + length) % length;
        let directionStep = (record.patrolDirection === -1) ? -1 : 1;
        record.patrolDirection = directionStep;

        for (let attempt = 0; attempt < length; attempt += 1) {
            const point = path[index];
            if (!point) {
                index = (index + directionStep + length) % length;
                continue;
            }
            const targetX = clamp(point.x ?? px, 0, MAP_MAX_COORD);
            const targetY = clamp(point.y ?? py, 0, MAP_MAX_COORD);
            const dx = targetX - px;
            const dy = targetY - py;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq <= thresholdSq) {
                index = (index + directionStep + length) % length;
                record.patrolIndex = index;
                if (Math.random() < 0.05) {
                    directionStep = directionStep === -1 ? 1 : -1;
                    record.patrolDirection = directionStep;
                }
                continue;
            }
            record.patrolIndex = index;
            const direction = vectorToDirection(dx, dy, fallbackDirection);
            const stopDistance = Number.isFinite(record.patrolStopDistance)
                ? Math.max(0, record.patrolStopDistance)
                : 0;
            return {
                point: { x: targetX, y: targetY },
                direction,
                stopDistance
            };
        }

        return null;
    }

    resolveFallbackTarget(record, px, py, fallbackDirection = 16) {
        if (!record) {
            return null;
        }
        const spawn = this.ensureSpawnIsClear(record.spawn || this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex || 0));
        if (!spawn) {
            return null;
        }
        const offsets = [
            { dx: TILE_SIZE * 2, dy: 0 },
            { dx: -TILE_SIZE * 2, dy: 0 },
            { dx: 0, dy: TILE_SIZE * 2 },
            { dx: 0, dy: -TILE_SIZE * 2 },
            { dx: TILE_SIZE * 1.5, dy: TILE_SIZE * 1.5 },
            { dx: -TILE_SIZE * 1.5, dy: TILE_SIZE * 1.5 },
            { dx: TILE_SIZE * 1.5, dy: -TILE_SIZE * 1.5 },
            { dx: -TILE_SIZE * 1.5, dy: -TILE_SIZE * 1.5 }
        ];
        const minDistanceSq = (TILE_SIZE * 0.75) * (TILE_SIZE * 0.75);

        for (const offset of offsets) {
            const targetX = clamp(spawn.x + offset.dx, 0, MAP_MAX_COORD);
            const targetY = clamp(spawn.y + offset.dy, 0, MAP_MAX_COORD);
            if (this.isBlocked(targetX, targetY)) {
                continue;
            }
            const dx = targetX - px;
            const dy = targetY - py;
            const distanceSq = (dx * dx) + (dy * dy);
            if (distanceSq < minDistanceSq) {
                continue;
            }
            const direction = vectorToDirection(dx, dy, fallbackDirection);
            return {
                point: { x: targetX, y: targetY },
                direction,
                stopDistance: TILE_SIZE * 0.6
            };
        }
        return null;
    }

    updateRecruits(_now = Date.now()) {
        return;
    }

    spawnRecruit(record, options = {}) {
        if (!record || !this.playerFactory || typeof this.playerFactory.createSystemPlayer !== 'function') {
            return null;
        }
        const now = options.now ?? Date.now();
        const spawn = record.spawn ?? this.computeRecruitSpawn(record.cityId, null, null, record.slotIndex);
        record.spawn = spawn;

        const payload = {
            id: record.id,
            city: record.cityId,
            offset: {
                x: spawn.x,
                y: spawn.y
            },
            direction: spawn.direction ?? 16,
            isMoving: 0,
            isTurning: 0,
            sequence: 0,
            health: MAX_HEALTH,
            isFake: true,
            isFakeRecruit: true
        };

        const player = this.playerFactory.createSystemPlayer(payload, {
            isFake: true,
            isFakeRecruit: true,
            ownerId: record.ownerId ?? `fake_city_${record.cityId} `,
            type: 'fake_recruit',
            broadcast: options.broadcast !== false,
            health: MAX_HEALTH
        });

        if (!player) {
            return null;
        }

        player.direction = spawn.direction ?? player.direction;
        player.offset.x = spawn.x;
        player.offset.y = spawn.y;
        player.health = MAX_HEALTH;
        if (player.callsign) {
            record.callsign = player.callsign;
        }
        record.state = 'active';
        record.mode = 'patrol';
        record.respawnAt = 0;
        record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS;
        record.nextScanAt = now;
        record.nextThinkAt = now + RECRUIT_THINK_INTERVAL_MS;
        record.path = null;
        record.pathIndex = 0;
        record.lastPathBuildAt = 0;
        record.pathGoalKey = null;
        record.lastProgressAt = now;
        record.nextLosCheckAt = now;
        record.lastLosResult = false;
        record.lastSeenTargetAt = 0;
        record.lastSeenX = null;
        record.lastSeenY = null;
        record.visitedTiles = [];
        record.nextAwarenessScanAt = now;
        record.cachedAllyCenters = [];
        record.cachedAllies = 0;
        record.cachedEnemies = 0;
        record.repathAttempts = 0;
        record.motionSeed = Number.isFinite(record.motionSeed) ? record.motionSeed : Math.random();
        record.targetId = null;
        record.lastBroadcastAt = now;
        record.lastThinkAt = now;
        this.ensureRecruitPatrolState(record);
        record.lastMoveTimestamp = now;
        record.lastMoveX = spawn.x;
        record.lastMoveY = spawn.y;
        record.stuckCounter = 0;
        player.isMoving = 0;
        const debugLabel = `[recruit ${record.id}]`;
        this.debug(`${debugLabel} spawn ready at(${spawn.x.toFixed(1)}, ${spawn.y.toFixed(1)}) dir = ${player.direction} `);

        return player;
    }

    handleRecruitDeath(record, now = Date.now()) {
        if (!record || record.state === 'removed') {
            return;
        }
        record.state = 'dead';
        record.mode = 'dead';
        record.respawnAt = now + RECRUIT_RESPAWN_DELAY_MS;
        record.targetId = null;
        record.nextShotAt = 0;
        record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        record.stuckCounter = 0;
    }

    updateRecruitBehaviour(record, player, now) {
        if (!record || !player) {
            return;
        }

        this.ensureRecruitPatrolState(record);

        const players = this.game?.players || {};
        let px = player.offset?.x ?? 0;
        let py = player.offset?.y ?? 0;
        const previousDirection = wrapDirection(player.direction ?? 0);
        const previousMoving = player.isMoving ? 1 : 0;

        if (record.targetId) {
            const tracked = players[record.targetId];
            if (!this.isValidRecruitTarget(record, tracked, px, py)) {
                record.targetId = null;
            }
        }

        if (!record.targetId || !record.nextScanAt || now >= record.nextScanAt) {
            record.targetId = this.acquireRecruitTarget(record, px, py);
            record.nextScanAt = now + RECRUIT_TARGET_REFRESH_MS;
        }

        const target = record.targetId ? players[record.targetId] : null;

        if (!record.lastThinkAt) {
            record.lastThinkAt = now;
        }
        const deltaRaw = now - (record.lastThinkAt || now);
        const deltaMs = Math.max(0, Math.min(deltaRaw, RECRUIT_MAX_TICK_MS));
        record.lastThinkAt = now;

        const shooterCenter = {
            x: px + (TILE_SIZE / 2),
            y: py + (TILE_SIZE / 2)
        };

        let targetCenter = null;
        if (target) {
            targetCenter = {
                x: (target.offset?.x ?? target.x ?? 0) + (TILE_SIZE / 2),
                y: (target.offset?.y ?? target.y ?? 0) + (TILE_SIZE / 2)
            };
        }

        let hasLOS = false;
        let losChanged = false;
        const previousLos = record.lastLosResult === true;
        let lastSeenAge = record.lastSeenTargetAt ? now - record.lastSeenTargetAt : Infinity;

        if (targetCenter) {
            if (!record.nextLosCheckAt || now >= record.nextLosCheckAt) {
                const clear = this.losTileRaycast(shooterCenter.x, shooterCenter.y, targetCenter.x, targetCenter.y);
                record.lastLosResult = !!clear;
                record.nextLosCheckAt = now + LOS_RECHECK_MS;
                losChanged = previousLos !== record.lastLosResult;
            }
            hasLOS = record.lastLosResult === true;
            if (hasLOS) {
                record.lastSeenTargetAt = now;
                record.lastSeenX = targetCenter.x;
                record.lastSeenY = targetCenter.y;
                lastSeenAge = 0;
            } else if (record.lastSeenTargetAt) {
                lastSeenAge = now - record.lastSeenTargetAt;
            }
        }

        let lastSeen = null;
        if (lastSeenAge <= LAST_SEEN_TIMEOUT_MS) {
            lastSeen = {
                x: record.lastSeenX ?? shooterCenter.x,
                y: record.lastSeenY ?? shooterCenter.y
            };
        }

        const rangePx = targetCenter
            ? Math.sqrt(distanceSquared(shooterCenter.x, shooterCenter.y, targetCenter.x, targetCenter.y))
            : Infinity;

        const hpFrac = Number.isFinite(player.health) ? Math.max(0, Math.min(1, player.health / MAX_HEALTH)) : 1;
        const targetHpFrac = target && Number.isFinite(target.health)
            ? Math.max(0, Math.min(1, target.health / MAX_HEALTH))
            : 1;

        let nearbyAllies = record.cachedAllies || 0;
        let nearbyEnemies = record.cachedEnemies || 0;
        let allyCenters = Array.isArray(record.cachedAllyCenters) ? record.cachedAllyCenters : [];

        if (!record.nextAwarenessScanAt || now >= record.nextAwarenessScanAt) {
            const radiusSq = AWARENESS_RADIUS_PX * AWARENESS_RADIUS_PX;
            nearbyAllies = 0;
            nearbyEnemies = 0;
            allyCenters = [];
            let allySamples = 0;
            const allPlayers = Object.values(players);
            for (let index = 0; index < allPlayers.length; index += 1) {
                const candidate = allPlayers[index];
                if (!candidate || candidate.id === record.id || candidate.health <= 0) {
                    continue;
                }
                const cx = candidate.offset?.x ?? candidate.x ?? 0;
                const cy = candidate.offset?.y ?? candidate.y ?? 0;
                if (distanceSquared(px, py, cx, cy) > radiusSq) {
                    continue;
                }
                const candidateCity = Number(candidate.city);
                if (Number.isFinite(candidateCity) && candidateCity === record.cityId) {
                    nearbyAllies += 1;
                    if (allySamples < MAX_ALLY_SAMPLE) {
                        allyCenters.push({
                            x: cx + (TILE_SIZE / 2),
                            y: cy + (TILE_SIZE / 2)
                        });
                        allySamples += 1;
                    }
                } else {
                    nearbyEnemies += 1;
                }
            }
            record.cachedAllyCenters = allyCenters;
            record.cachedAllies = nearbyAllies;
            record.cachedEnemies = nearbyEnemies;
            record.nextAwarenessScanAt = now + AWARENESS_RESCAN_MS;
        }

        const outnumbered = nearbyEnemies > (nearbyAllies + 1);

        const mode = this.pickMode({
            target,
            hasLOS,
            rangePx,
            hpFrac,
            targetHpFrac,
            outnumbered,
            lastSeenAge
        });

        record.mode = mode;

        if (!record.lastProgressAt) {
            record.lastProgressAt = now;
        }

        const goal = this.computeGoalTile({
            mode,
            record,
            player,
            target,
            hasLOS,
            rangePx,
            lastSeen,
            now
        });

        let goalKey = null;
        if (goal && Number.isFinite(goal.goalTileX) && Number.isFinite(goal.goalTileY)) {
            goalKey = `${goal.goalTileX}_${goal.goalTileY} `;
        }

        let desiredDirectionHint = previousDirection;
        if (targetCenter) {
            const rawDirection = vectorToDirection(targetCenter.x - shooterCenter.x, targetCenter.y - shooterCenter.y, previousDirection);
            desiredDirectionHint = stepDirectionTowards(previousDirection, rawDirection, hasLOS ? 4 : 2);
        } else if (goal && Number.isFinite(goal.goalPixelX) && Number.isFinite(goal.goalPixelY)) {
            const rawDirection = vectorToDirection(goal.goalPixelX - px, goal.goalPixelY - py, previousDirection);
            desiredDirectionHint = stepDirectionTowards(previousDirection, rawDirection, 2);
        }

        let shouldRepath = false;
        if (goalKey && goalKey !== record.pathGoalKey) {
            shouldRepath = true;
        }
        if (losChanged && !hasLOS) {
            shouldRepath = true;
        }

        const nav = this.navGrid || this.buildNavGrid();
        const currentTile = pixelToTile(px, py);
        let desiredPoint = null;
        if (goal) {
            desiredPoint = {
                x: goal.goalPixelX ?? px,
                y: goal.goalPixelY ?? py
            };
        }

        if (goal && goal.requiresPath && desiredPoint) {
            const goalDistanceSq = distanceSquared(px, py, desiredPoint.x, desiredPoint.y);
            if (goalDistanceSq <= (PATH_MIN_DISTANCE_PX * PATH_MIN_DISTANCE_PX)) {
                goal.requiresPath = false;
            }
        }

        if (goal && (goal.requiresPath || shouldRepath || !record.path)) {
            if (!record.lastPathBuildAt || now - record.lastPathBuildAt >= PATH_REBUILD_COOLDOWN_MS) {
                if (nav && goalKey) {
                    const attempts = record.repathAttempts || 0;
                    if (attempts < MAX_REPATH_ATTEMPTS) {
                        const penaltySet = new Set(Array.isArray(record.visitedTiles) ? record.visitedTiles : []);
                        const computedPath = this.astar({ x: currentTile.x, y: currentTile.y }, { x: goal.goalTileX, y: goal.goalTileY }, nav, { visitedPenalty: penaltySet });
                        if (computedPath && computedPath.length) {
                            record.path = computedPath;
                            record.pathIndex = 0;
                            record.pathGoalKey = goalKey;
                            record.lastPathBuildAt = now;
                            record.repathAttempts = 0;
                        } else if (goal.requiresPath) {
                            record.repathAttempts = attempts + 1;
                            record.path = null;
                            record.pathIndex = 0;
                            record.pathGoalKey = null;
                            if (record.repathAttempts >= MAX_REPATH_ATTEMPTS) {
                                goal.requiresPath = false;
                            }
                        }
                    } else {
                        goal.requiresPath = false;
                        record.path = null;
                        record.pathIndex = 0;
                        record.pathGoalKey = null;
                    }
                }
            }
        }

        const resolveMovementPoint = () => {
            if (record.path && record.path.length && record.pathIndex < record.path.length) {
                const waypoint = record.path[record.pathIndex];
                const origin = tileToOffsetOrigin(waypoint.x, waypoint.y);
                const jitterBase = (Number.isFinite(record.motionSeed) ? record.motionSeed : 0.5) - 0.5;
                const jitterX = jitterBase * PATH_JITTER_PX;
                const jitterY = -jitterBase * PATH_JITTER_PX;
                return {
                    point: {
                        x: clamp(origin.x + jitterX, 0, MAP_MAX_COORD),
                        y: clamp(origin.y + jitterY, 0, MAP_MAX_COORD)
                    },
                    fromPath: true
                };
            }
            if (desiredPoint) {
                let point = desiredPoint;
                if (mode === 'patrol' && Number.isFinite(record.motionSeed)) {
                    point = {
                        x: clamp(desiredPoint.x + ((record.motionSeed - 0.5) * PATH_JITTER_PX), 0, MAP_MAX_COORD),
                        y: clamp(desiredPoint.y - ((record.motionSeed - 0.5) * PATH_JITTER_PX), 0, MAP_MAX_COORD)
                    };
                }
                return {
                    point,
                    fromPath: false
                };
            }
            return null;
        };

        const movementSpeeds = {
            engage: RECRUIT_PATROL_SPEED * 1.2,
            flank: RECRUIT_PATROL_SPEED * 1.1,
            kite: RECRUIT_PATROL_SPEED * 1.3,
            retreat: RECRUIT_PATROL_SPEED * 1.35,
            patrol: RECRUIT_PATROL_SPEED * 1.05
        };
        const movementSpeed = movementSpeeds[mode] ?? RECRUIT_PATROL_SPEED;

        let desiredDirection = desiredDirectionHint;
        let moved = false;
        let progressMade = false;
        let resetPerformed = false;
        let shouldBroadcast = false;
        let sequenceDelta = 0;
        let failedMoves = 0;

        let remainingTime = deltaMs;
        let iterations = 0;

        let targetInfo = resolveMovementPoint();
        if (!targetInfo && !goal) {
            const fallback = this.resolveFallbackTarget(record, px, py, previousDirection);
            if (fallback) {
                desiredPoint = { x: fallback.point.x, y: fallback.point.y };
                targetInfo = {
                    point: fallback.point,
                    fromPath: false
                };
            }
        }

        while (targetInfo && remainingTime > 0 && iterations < RECRUIT_MAX_SIM_STEPS) {
            const stepTime = Math.min(RECRUIT_SIMULATION_STEP_MS, remainingTime);
            const targetPoint = targetInfo.point;
            const baseVelocity = seekArrive({ x: px, y: py }, targetPoint, movementSpeed, ARRIVE_RADIUS_PX);
            if (!baseVelocity) {
                if (targetInfo.fromPath) {
                    record.pathIndex += 1;
                    if (record.path && record.pathIndex >= record.path.length) {
                        record.path = null;
                        record.pathGoalKey = null;
                    }
                }
                targetInfo = resolveMovementPoint();
                if (!targetInfo) {
                    break;
                }
                iterations += 1;
                continue;
            }

            const separation = separationAdjust({ x: px, y: py }, allyCenters, movementSpeed);
            let velocity = {
                dx: baseVelocity.dx + separation.dx,
                dy: baseVelocity.dy + separation.dy
            };
            if (!targetInfo.fromPath) {
                velocity = avoidanceAdjust({ x: px, y: py }, velocity, movementSpeed, nav, (tileX, tileY) => this.isNavTileBlocked(tileX, tileY));
            }

            const speedPerMs = Math.sqrt((velocity.dx * velocity.dx) + (velocity.dy * velocity.dy));
            if (!Number.isFinite(speedPerMs) || speedPerMs < 1e-4) {
                failedMoves += 1;
                break;
            }

            const unit = {
                dx: velocity.dx / speedPerMs,
                dy: velocity.dy / speedPerMs
            };
            const step = Math.min(speedPerMs * stepTime, movementSpeed * stepTime);
            let attempt = this.tryMoveWithVector(px, py, unit, step);
            if (!attempt) {
                const alternateStep = Math.min(step + TILE_SIZE * 0.1, TILE_SIZE * 1.2);
                attempt = this.findAlternateVector(unit, px, py, alternateStep);
            }
            if (!attempt) {
                failedMoves += 1;
                if (failedMoves >= 2) {
                    shouldRepath = true;
                }
                break;
            }

            const prevDistanceSq = distanceSquared(px, py, targetPoint.x, targetPoint.y);
            px = attempt.x;
            py = attempt.y;
            desiredDirection = attempt.direction;
            moved = true;

            const newDistanceSq = distanceSquared(px, py, targetPoint.x, targetPoint.y);
            if (newDistanceSq + 4 < prevDistanceSq) {
                progressMade = true;
            }

            remainingTime -= stepTime;
            iterations += 1;

            if (targetInfo.fromPath && record.path) {
                if (newDistanceSq <= (PATH_WAYPOINT_REACH_PX * PATH_WAYPOINT_REACH_PX)) {
                    record.pathIndex += 1;
                    if (record.pathIndex >= record.path.length) {
                        record.path = null;
                        record.pathGoalKey = null;
                    }
                    targetInfo = resolveMovementPoint();
                }
            } else if (!targetInfo.fromPath && newDistanceSq <= (PATH_WAYPOINT_REACH_PX * PATH_WAYPOINT_REACH_PX)) {
                break;
            }
        }

        player.offset.x = px;
        player.offset.y = py;

        if (moved) {
            const tile = pixelToTile(px, py);
            pushVisitedTile(record, tile.x, tile.y);
            record.lastProgressAt = now;
            record.lastMoveTimestamp = now;
            record.lastMoveX = px;
            record.lastMoveY = py;
            record.stuckCounter = 0;
            record.repathAttempts = 0;
            shouldBroadcast = true;
        } else {
            record.stuckCounter = (record.stuckCounter || 0) + 1;
        }

        if (!progressMade && (now - (record.lastProgressAt || now)) >= REPATH_STALL_MS) {
            shouldRepath = true;
        }

        if (shouldRepath && goal && goalKey && (!record.lastPathBuildAt || now - record.lastPathBuildAt >= PATH_REBUILD_COOLDOWN_MS)) {
            if (nav) {
                const attempts = record.repathAttempts || 0;
                if (attempts < MAX_REPATH_ATTEMPTS) {
                    const penaltySet = new Set(Array.isArray(record.visitedTiles) ? record.visitedTiles : []);
                    const recomputedPath = this.astar(pixelToTile(px, py), { x: goal.goalTileX, y: goal.goalTileY }, nav, { visitedPenalty: penaltySet });
                    if (recomputedPath && recomputedPath.length) {
                        record.path = recomputedPath;
                        record.pathIndex = 0;
                        record.pathGoalKey = goalKey;
                        record.lastPathBuildAt = now;
                        record.repathAttempts = 0;
                    } else {
                        record.repathAttempts = attempts + 1;
                        if (record.repathAttempts >= MAX_REPATH_ATTEMPTS) {
                            goal.requiresPath = false;
                            record.path = null;
                            record.pathIndex = 0;
                            record.pathGoalKey = null;
                        }
                        if (!moved && (now - (record.lastMoveTimestamp || now)) >= RECRUIT_STUCK_TIMEOUT_MS) {
                            const reset = this.resetRecruitPosition(record, player, now);
                            if (reset) {
                                px = player.offset.x ?? px;
                                py = player.offset.y ?? py;
                                desiredDirection = wrapDirection(player.direction ?? desiredDirection, desiredDirection);
                                moved = false;
                                resetPerformed = true;
                                shouldBroadcast = true;
                            }
                        }
                    }
                } else if (!moved && (now - (record.lastMoveTimestamp || now)) >= RECRUIT_STUCK_TIMEOUT_MS) {
                    const reset = this.resetRecruitPosition(record, player, now);
                    if (reset) {
                        px = player.offset.x ?? px;
                        py = player.offset.y ?? py;
                        desiredDirection = wrapDirection(player.direction ?? desiredDirection, desiredDirection);
                        moved = false;
                        resetPerformed = true;
                        shouldBroadcast = true;
                    }
                }
            }
        }

        player.isMoving = moved ? 1 : 0;
        if (resetPerformed) {
            player.isMoving = 0;
        }

        if (directionDelta(previousDirection, desiredDirection) > 0) {
            player.direction = desiredDirection;
            sequenceDelta += 1;
        }

        if (player.isMoving !== previousMoving) {
            sequenceDelta += 1;
        }

        if (sequenceDelta > 0) {
            player.sequence = (player.sequence || 0) + sequenceDelta;
            shouldBroadcast = true;
        }

        if (target && hasLOS) {
            if (!record.nextShotAt || now >= record.nextShotAt) {
                const aimFallback = targetCenter
                    ? vectorToDirection(targetCenter.x - shooterCenter.x, targetCenter.y - shooterCenter.y, player.direction ?? 16)
                    : player.direction ?? 16;
                const aimDirection = leadDirection(player, target, BULLET_SPEED_PX_PER_S, aimFallback);
                const jitter = Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? 1 : -1);
                const finalDirection = wrapDirection(aimDirection + jitter, aimDirection);
                const deltaAim = directionDelta(desiredDirection, finalDirection);
                const muzzleUnit = directionToUnitVector(finalDirection);
                const muzzleX = shooterCenter.x + (muzzleUnit.x * RECRUIT_MUZZLE_OFFSET);
                const muzzleY = shooterCenter.y + (muzzleUnit.y * RECRUIT_MUZZLE_OFFSET);
                const muzzleLos = this.losTileRaycast(muzzleX, muzzleY, targetCenter.x, targetCenter.y);
                const friendlyBlock = hasFriendlyObstruction(shooterCenter, targetCenter, allyCenters);

                if (deltaAim <= 2 && muzzleLos && !friendlyBlock) {
                    const fired = this.fireRecruitLaser(record, player, target, finalDirection, now);
                    if (fired) {
                        if (Math.random() < 0.35) {
                            record.nextShotAt = now + 140 + Math.floor(Math.random() * 120);
                        } else {
                            record.nextShotAt = now + RECRUIT_SHOOT_INTERVAL_MS + Math.floor(Math.random() * RECRUIT_SHOOT_JITTER_MS);
                        }
                    } else {
                        record.nextShotAt = now + 200;
                    }
                } else {
                    record.nextShotAt = now + 100;
                }
            }
        } else if (!target) {
            record.nextShotAt = now + 200;
        }

        if (!moved && !resetPerformed && (now - (record.lastMoveTimestamp || now)) >= RECRUIT_STUCK_TIMEOUT_MS) {
            const reset = this.resetRecruitPosition(record, player, now);
            if (reset) {
                shouldBroadcast = true;
            }
        }

        if (shouldBroadcast && this.io) {
            const cooldown = record.broadcastCooldown ?? 150;
            if (!record.lastBroadcastAt || (now - record.lastBroadcastAt) >= cooldown) {
                this.io.emit('player', JSON.stringify(player));
                record.lastBroadcastAt = now;
            }
        }
    }

    acquireRecruitTarget(record, px, py) {
        const players = this.game?.players || {};
        const detectionRadiusSq = RECRUIT_DETECTION_RADIUS * RECRUIT_DETECTION_RADIUS;
        let bestId = null;
        let bestDistanceSq = detectionRadiusSq;

        for (const candidate of Object.values(players)) {
            if (!this.isEnemyRecruitCandidate(record, candidate)) {
                continue;
            }
            const cx = candidate.offset?.x ?? 0;
            const cy = candidate.offset?.y ?? 0;
            const distSq = distanceSquared(px, py, cx, cy);
            if (distSq > detectionRadiusSq) {
                continue;
            }
            if (!bestId || distSq < bestDistanceSq) {
                bestId = candidate.id;
                bestDistanceSq = distSq;
            }
        }

        return bestId;
    }

    isValidRecruitTarget(record, target, px, py) {
        if (!this.isEnemyRecruitCandidate(record, target)) {
            return false;
        }
        const tx = target.offset?.x ?? 0;
        const ty = target.offset?.y ?? 0;
        const distSq = distanceSquared(px, py, tx, ty);
        if (distSq > RECRUIT_MAX_RANGE_SQUARED) {
            return false;
        }
        return true;
    }

    isEnemyRecruitCandidate(record, candidate) {
        if (!record || !candidate) {
            return false;
        }
        if (candidate.id === record.id) {
            return false;
        }
        if (candidate.health !== undefined && candidate.health <= 0) {
            return false;
        }
        if (candidate.isCloaked) {
            return false;
        }
        const candidateCity = Number(candidate.city);
        if (Number.isFinite(candidateCity) && candidateCity === record.cityId) {
            return false;
        }
        if (candidate.isSystemControlled && candidate.isFakeRecruit && Number.isFinite(candidate.city) && candidate.city === record.cityId) {
            return false;
        }
        return true;
    }

    fireRecruitLaser(record, player, target, direction, now) {
        if (!this.bulletFactory || typeof this.bulletFactory.spawnSystemBullet !== 'function') {
            return false;
        }

        const originX = (player.offset?.x ?? 0) + (TILE_SIZE / 2);
        const originY = (player.offset?.y ?? 0) + (TILE_SIZE / 2);
        const unit = directionToUnitVector(direction);
        const mapMax = (512 * TILE_SIZE) - 1;
        const bulletX = clamp(originX + (unit.x * RECRUIT_MUZZLE_OFFSET), 0, mapMax);
        const bulletY = clamp(originY + (unit.y * RECRUIT_MUZZLE_OFFSET), 0, mapMax);

        const payload = {
            shooterId: record.id,
            x: bulletX,
            y: bulletY,
            angle: -direction,
            type: 0,
            teamId: record.cityId,
            sourceId: record.id,
            sourceType: 'fake_recruit',
            targetId: target?.id ?? null
        };

        this.bulletFactory.spawnSystemBullet(payload);
        record.lastShotAt = now;
        return true;
    }

    computeRecruitSpawn(cityId, baseTileX = null, baseTileY = null, slotIndex = 0) {
        const record = this.activeCities.get(cityId);
        const spawnInfo = citySpawns[String(cityId)];
        const resolvedBaseX = toFiniteNumber(baseTileX, toFiniteNumber(record?.baseTileX, spawnInfo?.tileX ?? 0));
        const resolvedBaseY = toFiniteNumber(baseTileY, toFiniteNumber(record?.baseTileY, spawnInfo?.tileY ?? 0));
        const spawnPoint = record?.spawnPoint;
        let originX = Number.isFinite(spawnPoint?.x) ? spawnPoint.x : null;
        let originY = Number.isFinite(spawnPoint?.y) ? spawnPoint.y : null;
        if (!Number.isFinite(originX) || !Number.isFinite(originY)) {
            originX = (resolvedBaseX + 1.5) * TILE_SIZE;
            originY = (resolvedBaseY + 1) * TILE_SIZE;
        }

        const pattern = RECRUIT_POSITION_PATTERNS[slotIndex % RECRUIT_POSITION_PATTERNS.length] || { dx: 0, dy: 0, direction: 16 };
        const ring = Math.floor(slotIndex / RECRUIT_POSITION_PATTERNS.length);
        const offsetX = pattern.dx + (ring * TILE_SIZE * 1.5);
        const offsetY = pattern.dy + (ring * TILE_SIZE);
        const mapMax = (512 * TILE_SIZE) - TILE_SIZE;

        const spawn = {
            x: clamp(originX + offsetX, 0, mapMax),
            y: clamp(originY + offsetY, 0, mapMax),
            direction: pattern.direction ?? 16
        };
        this.debug(`[bot] computed spawn for city ${cityId} at(${spawn.x}, ${spawn.y})`);
        return this.ensureSpawnIsClear(spawn);
    }

    ensureCityRecruits(cityId, entry, baseTileX, baseTileY) {
        const numericCity = toFiniteNumber(cityId, null);
        if (numericCity === null) {
            return;
        }
        const count = Math.max(0, toFiniteNumber(entry?.recruitCount, RECRUIT_DEFAULT_COUNT));
        if (count <= 0) {
            this.removeCityRecruits(numericCity, { broadcast: true });
            return;
        }

        const existingIds = this.recruitsByCity.get(numericCity);
        if (existingIds && existingIds.length) {
            this.removeCityRecruits(numericCity, { broadcast: true });
        }

        const ids = [];
        const now = Date.now();
        const patrolPath = this.getPatrolPathForCity(numericCity);
        const pathLength = patrolPath.length;
        for (let index = 0; index < count; index += 1) {
            const id = `fake_recruit_${numericCity}_${index} `;
            const spawn = this.computeRecruitSpawn(numericCity, baseTileX, baseTileY, index);
            const rotation = pathLength ? Math.floor(Math.random() * pathLength) : 0;
            const variant = pathLength ? createPatrolVariant(patrolPath, { rotation }) : [];
            const patrolDirection = Math.random() < 0.5 ? -1 : 1;
            const patrolThreshold = RECRUIT_PATROL_POINT_THRESHOLD + (Math.random() * TILE_SIZE * 0.25);
            const patrolStopDistance = TILE_SIZE * (0.5 + Math.random() * 0.4);
            const record = {
                id,
                cityId: numericCity,
                slotIndex: index,
                spawn,
                state: 'pending',
                respawnAt: 0,
                nextShotAt: 0,
                nextScanAt: now,
                nextThinkAt: 0,
                ownerId: `fake_city_${numericCity} `,
                lastBroadcastAt: 0,
                broadcastCooldown: 150,
                targetId: null,
                patrolIndex: 0,
                patrolVariant: variant.length ? variant : null,
                patrolDirection,
                patrolThreshold,
                patrolStopDistance,
                mode: 'pending',
                motionSeed: Math.random()
            };
            this.ensureRecruitPatrolState(record);
            this.recruits.set(id, record);
            ids.push(id);
        }
        this.recruitsByCity.set(numericCity, ids);
    }

    removeCityRecruits(cityId, options = {}) {
        const ids = this.recruitsByCity.get(cityId);
        if (!ids || !ids.length) {
            return;
        }
        const broadcast = options.broadcast !== false;
        const players = this.game?.players || {};

        ids.forEach((id) => {
            const record = this.recruits.get(id);
            if (record) {
                record.state = 'removed';
                record.respawnAt = 0;
                record.targetId = null;
                record.mode = 'removed';
            }
            if (players[id]) {
                if (this.playerFactory && typeof this.playerFactory.removeSystemPlayer === 'function') {
                    this.playerFactory.removeSystemPlayer(id, { broadcast });
                } else {
                    delete players[id];
                    if (broadcast && this.io) {
                        this.io.emit('player:removed', JSON.stringify({ id }));
                    }
                }
            }
            this.recruits.delete(id);
        });

        this.recruitsByCity.delete(cityId);
    }

    sendSnapshot(target) {
        if (this.disabled) {
            return;
        }
        if (!target) {
            return;
        }
        if (this.defenseManager) {
            this.defenseManager.sendSnapshot(target);
            return;
        }
        for (const [cityId, record] of this.activeCities.entries()) {
            if (record && Array.isArray(record.defenseItems) && record.defenseItems.length) {
                this.emitDefenseSnapshot(cityId, record.defenseItems, target);
            }
        }
    }

    spawnCityBot(cityId, options = {}) {
        if (!Number.isFinite(cityId)) {
            return null;
        }
        const numericCity = Math.max(0, Math.floor(cityId));

        const scriptPath = path.resolve(__dirname, '../../bot/index.js');
        const botCwd = path.resolve(__dirname, '../../bot');
        const serverUrl = process.env.BATTLECITY_SERVER || 'http://localhost:8021';
        const role = typeof options.role === 'string' ? options.role : 'recruit';
        const args = [scriptPath, '--city', String(numericCity), '--role', role];
        if (options.name) {
            args.push('--name', String(options.name));
        }

        try {
            const child = spawn(
                process.execPath,
                args,
                {
                    cwd: botCwd,
                    stdio: ['ignore', 'inherit', 'inherit'],
                    env: Object.assign({}, process.env, {
                        BATTLECITY_SERVER: serverUrl
                    })
                }
            );

            let cleaned = false;
            const cleanup = () => {
                if (cleaned) {
                    return;
                }
                cleaned = true;
                const cityBots = this.botProcesses.get(numericCity);
                if (cityBots) {
                    cityBots.delete(child);
                    if (cityBots.size === 0) {
                        this.botProcesses.delete(numericCity);
                    }
                }
                const record = this.activeCities.get(numericCity);
                if (record && Array.isArray(record.botProcesses)) {
                    record.botProcesses = record.botProcesses.filter((proc) => proc !== child);
                }
            };

            child.once('error', (error) => {
                this.debug(`[bot] spawn failed for city ${numericCity}: ${error.message} `);
                cleanup();
            });

            child.once('exit', (code, signal) => {
                this.debug(
                    `[bot] city ${numericCity} bot exited code = ${code} signal = ${signal || 'null'} `
                );
                cleanup();
            });

            const cityBots = this.botProcesses.get(numericCity) || new Set();
            cityBots.add(child);
            this.botProcesses.set(numericCity, cityBots);

            const record = this.activeCities.get(numericCity);
            if (record) {
                if (!Array.isArray(record.botProcesses)) {
                    record.botProcesses = [];
                }
                record.botProcesses.push(child);
            }

            this.debug(`[bot] launched bot for city ${numericCity}${options.name ? ` (${options.name})` : ''} `);
            return child;
        } catch (error) {
            this.debug(`[bot] unable to launch bot for city ${numericCity}: ${error.message} `);
            return null;
        }
    }

    killCityBot(cityId, reason = 'unknown') {
        const numericCity = Number.isFinite(cityId) ? Math.max(0, Math.floor(cityId)) : null;
        if (numericCity === null) {
            return;
        }
        const bots = this.botProcesses.get(numericCity);
        if (!bots || bots.size === 0) {
            return;
        }
        this.botProcesses.delete(numericCity);
        const record = this.activeCities.get(numericCity);
        if (record) {
            record.botProcesses = [];
        }
        let terminated = 0;
        for (const child of bots) {
            if (!child) {
                continue;
            }
            try {
                if (!child.killed) {
                    child.kill();
                }
                terminated += 1;
            } catch (error) {
                this.debug(`[bot] failed to terminate bot for city ${numericCity}: ${error.message} `);
            }
        }
        if (terminated > 0) {
            this.debug(`[bot] terminated ${terminated} bot(s) for city ${numericCity}(${reason})`);
        }
    }

    emitDefenseSnapshot(cityId, items, target = null) {
        if (!Array.isArray(items) || !items.length) {
            return;
        }
        const payload = {
            cityId,
            items: items.map((item) => {
                const snapshot = {
                    id: item.id,
                    type: item.type,
                    x: item.x,
                    y: item.y,
                    teamId: item.teamId,
                };
                if (item.ownerId !== undefined) {
                    snapshot.ownerId = item.ownerId;
                }
                if (item.angle !== undefined) {
                    snapshot.angle = item.angle;
                }
                return snapshot;
            })
        };
        const emitter = target ?? this.io;
        if (!emitter) {
            return;
        }
        emitter.emit('city:defenses', payload);
    }

    emitDefenseClear(cityId, target = null) {
        const payload = { cityId };
        const emitter = target ?? this.io;
        if (!emitter) {
            return;
        }
        emitter.emit('city:defenses:clear', payload);
    }

    resolveDefenseItemType(type) {
        if (type === null || type === undefined) {
            return null;
        }
        if (typeof type === 'number' && Number.isFinite(type)) {
            return type;
        }
        const key = String(type).toLowerCase();
        if (Object.prototype.hasOwnProperty.call(DEFENSE_ITEM_TYPES, key)) {
            return DEFENSE_ITEM_TYPES[key];
        }
        return null;
    }

    /**
     * Generate random hazard placements within city bounds
     * Validates positions against buildings, blocking tiles, and map edges
     * @param {number} baseX - Base tile X coordinate
     * @param {number} baseY - Base tile Y coordinate
     * @param {Array} layout - Building layout
     * @param {number} count - Number of hazards to generate
     * @param {string} type - Hazard type ('mine', 'turret', 'plasma', 'sleeper')
     * @returns {Array} - Array of hazard placements {type, dx, dy, angle?}
     */
    generateRandomHazards(baseX, baseY, layout, count, type, extraOccupied = null) {
        const hazards = [];
        if (count <= 0) {
            return hazards;
        }

        const shuffleInPlace = (values) => {
            if (!Array.isArray(values) || values.length < 2) {
                return;
            }
            for (let i = values.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                if (j === i) {
                    continue;
                }
                const tmp = values[i];
                values[i] = values[j];
                values[j] = tmp;
            }
        };

        // Calculate city bounds from layout
        const bounds = calculateLayoutBounds(layout, baseX, baseY);
        const minX = Math.max(0, bounds.minTileX - 2);
        const maxX = Math.min(MAP_SIZE_TILES - 1, bounds.maxTileX + 2);
        const minY = Math.max(0, bounds.minTileY - 2);
        const maxY = Math.min(MAP_SIZE_TILES - 1, bounds.maxTileY + 2);

        // Build set of occupied tiles from layout and exclusions
        const occupiedTiles = new Set();
        if (Array.isArray(layout)) {
            for (const blueprint of layout) {
                const dx = toFiniteNumber(blueprint?.dx, 0);
                const dy = toFiniteNumber(blueprint?.dy, 0);
                const tileX = Math.floor(baseX + dx);
                const tileY = Math.floor(baseY + dy);

                // Mark tiles occupied by this building (including multi-tile buildings)
                const { width, height } = resolveBlueprintSize(toFiniteNumber(blueprint?.type, null));
                for (let ox = 0; ox < width; ox++) {
                    for (let oy = 0; oy < height; oy++) {
                        occupiedTiles.add(`${tileX + ox}_${tileY + oy}`);
                    }
                }
            }
        }
        if (extraOccupied && extraOccupied.size) {
            extraOccupied.forEach((key) => occupiedTiles.add(key));
        }

        // Helper to check if a position is valid
        const isValidPosition = (tileX, tileY, placedPositions, bounds = null) => {
            const boundsMinX = bounds?.minX ?? minX;
            const boundsMaxX = bounds?.maxX ?? maxX;
            const boundsMinY = bounds?.minY ?? minY;
            const boundsMaxY = bounds?.maxY ?? maxY;
            // Check map bounds
            if (tileX < boundsMinX || tileX > boundsMaxX || tileY < boundsMinY || tileY > boundsMaxY) {
                return false;
            }

            // Check if occupied by building
            if (occupiedTiles.has(`${tileX}_${tileY}`)) {
                return false;
            }

            // Check if already placed hazard here
            if (placedPositions.has(`${tileX}_${tileY}`)) {
                return false;
            }

            // Check if blocking tile (lava, rocks, water)
            const mapValue = this.getMapValue(tileX, tileY);
            if (isBlockingTileValue(mapValue)) {
                return false;
            }

            return true;
        };

        const placedPositions = new Set();
        const candidateKeys = new Set();
        const candidates = [];

        const collectCandidates = (paddingTiles = 0) => {
            const paddedMinX = clampTileIndex(minX - paddingTiles);
            const paddedMaxX = clampTileIndex(maxX + paddingTiles);
            const paddedMinY = clampTileIndex(minY - paddingTiles);
            const paddedMaxY = clampTileIndex(maxY + paddingTiles);
            for (let tileX = paddedMinX; tileX <= paddedMaxX; tileX += 1) {
                for (let tileY = paddedMinY; tileY <= paddedMaxY; tileY += 1) {
                    const key = `${tileX}_${tileY}`;
                    if (candidateKeys.has(key)) {
                        continue;
                    }
                    if (!isValidPosition(tileX, tileY, placedPositions, {
                        minX: paddedMinX,
                        maxX: paddedMaxX,
                        minY: paddedMinY,
                        maxY: paddedMaxY
                    })) {
                        continue;
                    }
                    candidateKeys.add(key);
                    candidates.push({ tileX, tileY });
                }
            }
        };

        // Collect candidates inside the footprint and gradually expand outward if needed
        collectCandidates(0);
        let padding = 2;
        while (candidates.length < count && padding <= 10) {
            collectCandidates(padding);
            padding += 2;
        }

        shuffleInPlace(candidates);

        for (const candidate of candidates) {
            if (hazards.length >= count) {
                break;
            }
            const dx = candidate.tileX - baseX;
            const dy = candidate.tileY - baseY;

            const offsetX = 0.1 + Math.random() * 0.8;
            const offsetY = 0.1 + Math.random() * 0.8;

            const hazard = {
                type,
                dx: dx + offsetX,
                dy: dy + offsetY
            };

            if (type === 'turret' || type === 'plasma' || type === 'sleeper') {
                hazard.angle = Math.floor(Math.random() * 32);
            }

            hazards.push(hazard);
            placedPositions.add(`${candidate.tileX}_${candidate.tileY}`);
        }

        if (hazards.length < count) {
            this.debug(`[fake - city] Only placed ${hazards.length}/${count} ${type} hazards (insufficient valid tiles)`);
        }

        return hazards;
    }

    /**
     * Generate guaranteed defenses around the command center's bottom row (orbable zone)
     * @param {number} baseX - Base tile X coordinate
     * @param {number} baseY - Base tile Y coordinate
     * @returns {Array} - Array of defense placements for CC protection
     */
    generateCommandCenterDefenses(_baseX, _baseY) {
        const defenses = [];

        // Command center is 3 tiles wide, 2 tiles tall
        // Bottom row (y + 2) is the orbable zone - heavily defend it

        // Place walls directly on the bottom row of the CC footprint (orbable zone)
        for (let dx = 0; dx < COMMAND_CENTER_WIDTH_TILES; dx++) {
            defenses.push({
                type: 'wall',
                dx,
                dy: COMMAND_CENTER_HEIGHT_TILES,
                allowOverlap: false
            });
        }

        // Mines slightly ahead of the walls to avoid overlap but still guard the front
        defenses.push({
            type: 'mine',
            dx: 0.5,
            dy: COMMAND_CENTER_HEIGHT_TILES + 0.5
        });
        defenses.push({
            type: 'mine',
            dx: 2.5,
            dy: COMMAND_CENTER_HEIGHT_TILES + 0.5
        });

        // Turrets on the corners of the orbable zone
        defenses.push({
            type: 'turret',
            dx: -1,
            dy: COMMAND_CENTER_HEIGHT_TILES,
            angle: 8 // Facing down-right
        });

        defenses.push({
            type: 'turret',
            dx: COMMAND_CENTER_WIDTH_TILES,
            dy: COMMAND_CENTER_HEIGHT_TILES,
            angle: 24 // Facing down-left
        });

        // Additional plasma cannons for extra defense
        defenses.push({
            type: 'plasma',
            dx: -1,
            dy: 0,
            angle: 16 // Facing down
        });

        defenses.push({
            type: 'plasma',
            dx: COMMAND_CENTER_WIDTH_TILES,
            dy: 0,
            angle: 16 // Facing down
        });

        return defenses;
    }

    /**
     * Build a set of occupied/exclusion tiles including CC footprint, walls, and a small escape corridor
     */
    buildCcOccupiedTiles(baseX, baseY, ccDefenses) {
        const occupied = new Set();
        // CC footprint
        for (let ox = 0; ox < COMMAND_CENTER_WIDTH_TILES; ox++) {
            for (let oy = 0; oy < COMMAND_CENTER_HEIGHT_TILES; oy++) {
                occupied.add(`${baseX + ox}_${baseY + oy}`);
            }
        }
        // Add CC defenses (walls/mines/turrets/plasma positions)
        if (Array.isArray(ccDefenses)) {
            ccDefenses.forEach((def) => {
                const dx = toFiniteNumber(def?.dx, null);
                const dy = toFiniteNumber(def?.dy, null);
                if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
                    return;
                }
                const tx = Math.floor(baseX + dx);
                const ty = Math.floor(baseY + dy);
                occupied.add(`${tx}_${ty}`);
            });
        }
        // Escape corridor directly below CC: clear a 5x4 area centered on CC
        const corridorMinX = baseX - 1;
        const corridorMaxX = baseX + COMMAND_CENTER_WIDTH_TILES + 1;
        const corridorMinY = baseY + COMMAND_CENTER_HEIGHT_TILES;
        const corridorMaxY = corridorMinY + 3;
        for (let x = corridorMinX; x <= corridorMaxX; x++) {
            for (let y = corridorMinY; y <= corridorMaxY; y++) {
                if (x >= 0 && y >= 0 && x < MAP_SIZE_TILES && y < MAP_SIZE_TILES) {
                    occupied.add(`${x}_${y}`);
                }
            }
        }
        return occupied;
    }

    deployDefenses(cityId, entry, baseX, baseY, layout, ownerId) {
        const result = {
            items: [],
            hazardIds: [],
            hazardCounts: {}
        };
        const defenses = Array.isArray(entry?.defenses) && entry.defenses.length
            ? entry.defenses
            : (Array.isArray(this.config.defaultDefenses) ? this.config.defaultDefenses : []);
        if (!defenses.length) {
            return result;
        }

        const layoutOccupied = new Set();
        if (Array.isArray(layout)) {
            for (const blueprint of layout) {
                const dx = toFiniteNumber(blueprint?.dx, 0);
                const dy = toFiniteNumber(blueprint?.dy, 0);
                const tileX = Math.floor(baseX + dx);
                const tileY = Math.floor(baseY + dy);
                const { width, height } = resolveBlueprintSize(toFiniteNumber(blueprint?.type, null));
                for (let ox = 0; ox < width; ox++) {
                    for (let oy = 0; oy < height; oy++) {
                        const key = `${tileX + ox}_${tileY + oy}`;
                        layoutOccupied.add(key);
                    }
                }
            }
        }

        const placedTiles = new Set();
        const maxTileIndex = 512;

        for (const defense of defenses) {
            const rawType = defense?.type;
            if (rawType === undefined || rawType === null) {
                continue;
            }
            const dx = toFiniteNumber(defense?.dx, null);
            const dy = toFiniteNumber(defense?.dy, null);
            if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
                continue;
            }
            const tileX = baseX + dx;
            const tileY = baseY + dy;
            if (!Number.isFinite(tileX) || !Number.isFinite(tileY)) {
                continue;
            }
            if (tileX < 0 || tileY < 0 || tileX >= maxTileIndex || tileY >= maxTileIndex) {
                continue;
            }
            const column = Math.floor(tileX);
            const row = Math.floor(tileY);
            const tileKey = `${column}_${row}`;
            if (defense.allowOverlap !== true) {
                if (layoutOccupied.has(tileKey) || placedTiles.has(tileKey)) {
                    continue;
                }
            }

            const worldX = tileX * TILE_SIZE;
            const worldY = tileY * TILE_SIZE;
            const typeKey = typeof rawType === 'string' ? rawType.toLowerCase() : rawType;

            if (typeKey === 'mine' || typeKey === 'mines' || typeKey === 'minefield' || typeKey === 'dfg') {
                if (!this.hazardManager || typeof this.hazardManager.spawnSystemHazard !== 'function') {
                    continue;
                }
                const hazardId = defense.id || `fake_${typeKey}_${cityId}_${++this.defenseSequence}`;
                const hazard = this.hazardManager.spawnSystemHazard({
                    id: hazardId,
                    type: typeKey === 'dfg' ? 'dfg' : 'mine',
                    x: worldX,
                    y: worldY,
                    teamId: cityId,
                    ownerId,
                });
                if (hazard) {
                    result.hazardIds.push(hazard.id);
                    const hazardItemType = (hazard.type === 'dfg') ? ITEM_TYPES.DFG : ITEM_TYPES.MINE;
                    const currentHazardCount = result.hazardCounts[hazardItemType] || 0;
                    result.hazardCounts[hazardItemType] = currentHazardCount + 1;
                    placedTiles.add(tileKey);
                }
                continue;
            }

            const itemType = this.resolveDefenseItemType(typeKey);
            if (itemType === null) {
                continue;
            }

            const item = {
                id: defense.id || `fake_defense_${cityId}_${++this.defenseSequence}`,
                type: itemType,
                x: worldX,
                y: worldY,
                ownerId,
                teamId: cityId,
            };
            const angle = toFiniteNumber(defense?.angle, null);
            if (Number.isFinite(angle)) {
                item.angle = angle;
            }
            result.items.push(item);
            placedTiles.add(tileKey);
        }

        if (this.defenseManager) {
            const sanitized = this.defenseManager.replaceSystemDefenses(cityId, result.items, { ownerId });
            if (Array.isArray(sanitized)) {
                result.items = sanitized;
            }
        }

        return result;
    }

    spawnFakeCities(count, configured = this.getConfiguredCities()) {
        if (!count || count <= 0) {
            return;
        }
        const available = configured.filter((entry) => !this.activeCities.has(toFiniteNumber(entry.cityId)));
        if (!available.length) {
            return;
        }
        for (const entry of available) {
            if (count <= 0) {
                break;
            }
            if (this.spawnFakeCity(entry)) {
                count -= 1;
            }
        }
    }

    spawnFakeCity(entry) {
        const cityId = toFiniteNumber(entry?.cityId, null);
        if (cityId === null || this.activeCities.has(cityId)) {
            return false;
        }
        const spawn = citySpawns && citySpawns[String(cityId)];
        if (!spawn) {
            return false;
        }

        const baseX = toFiniteNumber(entry.baseTileX, toFiniteNumber(spawn.tileX, 0));
        const baseY = toFiniteNumber(entry.baseTileY, toFiniteNumber(spawn.tileY, 0));

        // Try to load layout from city file based on city name
        let layout = null;
        if (this.cityFileLayouts.size > 0) {
            const cityName = spawn.name || '';
            layout = CityFileLoader.pickRandomLayout(this.cityFileLayouts, cityName);
            if (layout) {
                this.debug(`[fake-city] Using ${cityName} layout`);
            }
        }

        // Fall back to configured layout if no city file layout found
        if (!layout || layout.length === 0) {
            layout = Array.isArray(entry.layout) && entry.layout.length
                ? entry.layout
                : (Array.isArray(this.config.layout) ? this.config.layout : []);
        }

        if (!layout.length) {
            return false;
        }

        if (this.buildingFactory) {
            this.buildingFactory.destroyCity(cityId);
        }

        const cityManager = this.buildingFactory?.cityManager;
        const cityState = cityManager ? cityManager.ensureCity(cityId) : null;

        if (cityState) {
            cityState.isFake = true;
            if (entry.name) {
                cityState.name = entry.name;
                cityState.nameOverride = entry.name;
            }
            cityState.tileX = baseX;
            cityState.tileY = baseY;
            cityState.x = baseX * 48;
            cityState.y = baseY * 48;
        }

        const ownerId = `fake_city_${cityId}`;
        const spawnPoint = (this.playerFactory && typeof this.playerFactory.getSpawnForCity === 'function')
            ? this.playerFactory.getSpawnForCity(cityId)
            : null;
        const patrolPath = this.buildPatrolPath(entry, baseX, baseY, layout);
        const spawnedIds = [];
        let testBuilding = null;

        for (const blueprint of layout) {
            const type = toFiniteNumber(blueprint?.type, null);
            if (type === null) {
                continue;
            }
            const dx = toFiniteNumber(blueprint?.dx, 0);
            const dy = toFiniteNumber(blueprint?.dy, 0);
            const x = baseX + dx;
            const y = baseY + dy;

            // DEBUG TEST: Spawn first building to see coordinate system
            if (spawnedIds.length === 0) {
                console.log(`[fake-city TEST] City spawn: (${baseX}, ${baseY})`);
                console.log(`[fake-city TEST] First building: type=${type}, dx=${dx}, dy=${dy}`);
                console.log(`[fake-city TEST] Calculated position: (${x}, ${y})`);
            }

            const building = this.buildingFactory?.spawnStaticBuilding({
                id: `fake_${cityId}_${x}_${y}`,
                ownerId,
                city: cityId,
                x,
                y,
                type,
                itemsLeft: toFiniteNumber(blueprint?.itemsLeft, 0),
            });
            if (building) {
                spawnedIds.push(building.id);
                if (spawnedIds.length === 1) {
                    testBuilding = { x, y, type };
                }
            }
        }

        if (testBuilding) {
            console.log(`[fake-city TEST] First building spawned at: (${testBuilding.x}, ${testBuilding.y}) type=${testBuilding.type}`);
        }

        if (spawnedIds.length === 0) {
            if (cityState) {
                delete cityState.isFake;
                delete cityState.fakeBotMayorSlots;
                delete cityState.fakeBotRecruitCapacity;
            }
            return false;
        }

        // Generate multi-tiered defenses:
        // 1. Guaranteed CC defenses (includes walls on CC bottom row)
        const ccDefenses = this.generateCommandCenterDefenses(baseX, baseY);

        // Build occupied/exclusion tiles so hazards avoid CC footprint/defenses and leave an escape corridor
        const ccOccupiedTiles = this.buildCcOccupiedTiles(baseX, baseY, ccDefenses);

        // 2. Random hazards/items across the city: ensure each type appears
        const randomMines = this.generateRandomHazards(baseX, baseY, layout, 8, 'mine', ccOccupiedTiles);
        const randomTurrets = this.generateRandomHazards(baseX, baseY, layout, 4, 'turret', ccOccupiedTiles);
        const randomPlasma = this.generateRandomHazards(baseX, baseY, layout, 3, 'plasma', ccOccupiedTiles);
        const randomSleepers = this.generateRandomHazards(baseX, baseY, layout, 2, 'sleeper', ccOccupiedTiles);
        const randomDfg = this.generateRandomHazards(baseX, baseY, layout, 2, 'dfg', ccOccupiedTiles);

        // Combine all defenses
        const allDefenses = [
            ...ccDefenses,
            ...randomMines,
            ...randomTurrets,
            ...randomPlasma,
            ...randomSleepers,
            ...randomDfg
        ];

        // Deploy defenses using the existing deployment system
        const customEntry = { ...entry, defenses: allDefenses };
        const defenses = this.deployDefenses(cityId, customEntry, baseX, baseY, layout, ownerId);
        const defenseItemsSnapshot = defenses.items.map((item) => ({ ...item }));
        const hazardIdsSnapshot = Array.isArray(defenses.hazardIds) ? [...defenses.hazardIds] : [];
        const hazardCountsSnapshot = defenses.hazardCounts ? { ...defenses.hazardCounts } : {};

        this.prefillCityInventory(cityId, defenseItemsSnapshot, hazardCountsSnapshot);

        const cityRecord = {
            ownerId,
            config: entry,
            buildingIds: spawnedIds,
            defenseItems: defenseItemsSnapshot,
            hazardIds: hazardIdsSnapshot,
            baseTileX: baseX,
            baseTileY: baseY,
            spawnPoint: spawnPoint || null,
            patrolPath: patrolPath.length ? patrolPath : [],
            botProcesses: [],
        };

        this.activeCities.set(cityId, cityRecord);

        const desiredBots = this.resolveDesiredBotCount(cityId, entry);
        this.ensureCityBotCount(cityId, desiredBots);

        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
        }

        if (!this.defenseManager && defenseItemsSnapshot.length) {
            this.emitDefenseSnapshot(cityId, defenseItemsSnapshot);
        }

        this.buildNavGrid(true);

        return true;
    }

    prefillCityInventory(cityId, defenseItems, hazardCounts) {
        const cityManager = this.buildingFactory?.cityManager;
        if (!cityManager || typeof cityManager.recordInventoryPickup !== 'function') {
            return;
        }
        const numericCity = toFiniteNumber(cityId, null);
        if (numericCity === null) {
            return;
        }

        const limitByItemType = {
            [ITEM_TYPES.WALL]: FACTORY_ITEM_LIMITS?.[108] ?? 20,
            [ITEM_TYPES.TURRET]: FACTORY_ITEM_LIMITS?.[109] ?? 10,
            [ITEM_TYPES.SLEEPER]: FACTORY_ITEM_LIMITS?.[110] ?? 5,
            [ITEM_TYPES.PLASMA]: FACTORY_ITEM_LIMITS?.[111] ?? 5,
            [ITEM_TYPES.MINE]: FACTORY_ITEM_LIMITS?.[104] ?? 10,
            [ITEM_TYPES.DFG]: FACTORY_ITEM_LIMITS?.[107] ?? 5,
        };

        const deployedCounts = {};
        if (Array.isArray(defenseItems)) {
            defenseItems.forEach((item) => {
                const type = toFiniteNumber(item?.type, null);
                if (!Number.isFinite(type)) {
                    return;
                }
                deployedCounts[type] = (deployedCounts[type] || 0) + 1;
            });
        }
        if (hazardCounts && typeof hazardCounts === 'object') {
            Object.entries(hazardCounts).forEach(([key, value]) => {
                const type = toFiniteNumber(key, null);
                const count = toFiniteNumber(value, 0);
                if (!Number.isFinite(type) || count <= 0) {
                    return;
                }
                deployedCounts[type] = (deployedCounts[type] || 0) + count;
            });
        }

        const factoryStockProvider = (itemType) => {
            if (this.buildingFactory && typeof this.buildingFactory.getCityFactoryStock === 'function') {
                return this.buildingFactory.getCityFactoryStock(numericCity, itemType);
            }
            return 0;
        };

        Object.entries(limitByItemType).forEach(([typeKey, limitValue]) => {
            const itemType = Number(typeKey);
            const limit = toFiniteNumber(limitValue, null);
            if (!Number.isFinite(itemType) || !Number.isFinite(limit) || limit <= 0) {
                return;
            }
            const deployed = deployedCounts[itemType] || 0;
            const factoryStock = factoryStockProvider(itemType) || 0;
            const currentInventory = (typeof cityManager.getInventoryCount === 'function')
                ? cityManager.getInventoryCount(numericCity, itemType)
                : 0;
            const desiredInventory = Math.max(0, limit - deployed - factoryStock);
            const delta = desiredInventory - currentInventory;
            if (delta > 0) {
                cityManager.recordInventoryPickup(null, numericCity, itemType, delta);
            }
        });
    }

    removeFakeCities(count) {
        if (!count || count <= 0) {
            return;
        }
        const activeIds = Array.from(this.activeCities.keys());
        activeIds.sort((a, b) => b - a);
        for (const cityId of activeIds) {
            if (count <= 0) {
                break;
            }
            if (this.despawnFakeCity(cityId)) {
                count -= 1;
            }
        }
    }

    despawnFakeCity(cityId) {
        if (!this.activeCities.has(cityId)) {
            return false;
        }
        const record = this.activeCities.get(cityId);
        this.killCityBot(cityId, 'city_removed');
        this.removeCityRecruits(cityId, { broadcast: true });
        if (record && Array.isArray(record.hazardIds) && this.hazardManager) {
            record.hazardIds.forEach((hazardId) => {
                this.hazardManager.removeHazard(hazardId, 'city_removed');
            });
            record.hazardIds = [];
        }
        if (this.defenseManager) {
            this.defenseManager.removeDefensesBySource(cityId, 'system');
        } else if (record && Array.isArray(record.defenseItems) && record.defenseItems.length) {
            this.emitDefenseClear(cityId);
        }
        if (record) {
            record.defenseItems = [];
        }
        if (this.buildingFactory) {
            this.buildingFactory.destroyCity(cityId);
        }
        const cityManager = this.buildingFactory?.cityManager;
        if (cityManager) {
            const city = cityManager.getCity(cityId);
            if (city) {
                delete city.isFake;
                delete city.fakeBotMayorSlots;
                delete city.fakeBotRecruitCapacity;
                if (city.nameOverride) {
                    delete city.nameOverride;
                }
                const spawnEntry = citySpawns && citySpawns[String(cityId)];
                if (spawnEntry && spawnEntry.name) {
                    city.name = spawnEntry.name;
                }
                cityManager.resetCity(cityId);
            }
        }
        this.activeCities.delete(cityId);
        if (this.playerFactory?.emitLobbySnapshot) {
            this.playerFactory.emitLobbySnapshot();
        }
        this.buildNavGrid(true);
        return true;
    }
}

/* TEST PLAN
[
  {
    "scenario": "open_field_engage",
    "inputs": { "mode": "engage", "hasLOS": true, "rangePx": 576, "hpFrac": 1, "targetHpFrac": 1 },
    "expect": { "mode": "engage", "firstWaypointTile": "direct", "fire": true }
  },
  {
    "scenario": "wall_between",
    "inputs": { "mode": "flank", "hasLOS": false, "lastSeenAge": 250, "rangePx": 640 },
    "expect": { "mode": "flank", "pathLength": ">0", "fire": false }
  },
  {
    "scenario": "doorway_crowd",
    "inputs": { "mode": "engage", "allies": 3, "rangePx": 512 },
    "expect": { "mode": "engage", "separation": "active", "clumping": "reduced" }
  },
  {
    "scenario": "stall_repath",
    "inputs": { "mode": "flank", "blocked": true, "stallMs": 700 },
    "expect": { "mode": "flank", "repath": true, "teleport": "no" }
  },
  {
    "scenario": "low_hp_kite",
    "inputs": { "mode": "kite", "hpFrac": 0.25, "targetHpFrac": 0.8, "hasLOS": true },
    "expect": { "mode": "retreat|kite", "rangePx": ">=KITE_RANGE_PX", "fire": "LOS_only" }
  }
]
*/
module.exports = FakeCityManager;
