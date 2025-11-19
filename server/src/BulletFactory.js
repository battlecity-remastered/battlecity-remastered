/*jslint node: true */
"use strict";

const debug = require('debug')('BattleCity:BulletFactory');
const {
    BULLET_SPEED_UNITS_PER_MS,
    BULLET_MAX_RANGE,
    BULLET_DAMAGE,
    DAMAGE_ROCKET,
    DAMAGE_FLARE,
    BULLET_FLARE_SPEED,
    TILE_SIZE,
    COMMAND_CENTER_WIDTH_TILES,
    COMMAND_CENTER_HEIGHT_TILES
} = require("./gameplay/constants");
const { getPlayerRect, rectangleCollision } = require("./gameplay/geometry");
const { isCommandCenter, isHospital, isHouse } = require('./constants');

let bulletCounter = 0;

const BULLET_DAMAGE_BY_TYPE = {
    0: BULLET_DAMAGE,
    1: DAMAGE_ROCKET,
    3: DAMAGE_FLARE,
};

const resolveBulletDamage = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_DAMAGE_BY_TYPE, type)) {
        return BULLET_DAMAGE_BY_TYPE[type];
    }
    return BULLET_DAMAGE;
};

const BULLET_SPEED_BY_TYPE = {
    0: BULLET_SPEED_UNITS_PER_MS,
    1: BULLET_SPEED_UNITS_PER_MS,
    3: BULLET_FLARE_SPEED ?? BULLET_SPEED_UNITS_PER_MS,
};

const resolveBulletSpeed = (type) => {
    if (Object.prototype.hasOwnProperty.call(BULLET_SPEED_BY_TYPE, type)) {
        return BULLET_SPEED_BY_TYPE[type];
    }
    return BULLET_SPEED_UNITS_PER_MS;
};

const decorateBulletMotion = (bullet) => {
    const radians = (bullet.angle / 16) * Math.PI;
    const unitX = Math.sin(radians) * -1;
    const unitY = Math.cos(radians) * -1;
    const velocityXPerMs = unitX * bullet.speed;
    const velocityYPerMs = unitY * bullet.speed;
    bullet.unitX = unitX;
    bullet.unitY = unitY;
    bullet.velocityXPerMs = velocityXPerMs;
    bullet.velocityYPerMs = velocityYPerMs;
    bullet.maxVelocityPerMs = Math.max(Math.abs(velocityXPerMs), Math.abs(velocityYPerMs));
    bullet.rect = {
        x: bullet.x,
        y: bullet.y,
        w: 4,
        h: 4
    };
    return bullet;
};

const BLOCKING_TILE_VALUES = new Set([2, 3]);
const MAP_SIZE_TILES = 512;
const MAP_PIXEL_SIZE = MAP_SIZE_TILES * TILE_SIZE;
const DEFAULT_BUILDING_WIDTH_TILES = COMMAND_CENTER_WIDTH_TILES;
const DEFAULT_BUILDING_HEIGHT_TILES = COMMAND_CENTER_HEIGHT_TILES;
const OPEN_BAY_HEIGHT_TILES = 1;
const BULLET_BUILDING_PADDING = 0;

class BulletFactory {

    constructor(game, playerFactory) {
        this.game = game;
        this.playerFactory = playerFactory;
        this.io = null;
        this.bullets = new Map();
        this.recentSourceShots = new Map();
        this.sourceCleanupAt = 0;
        this.buildingHitboxCache = new WeakMap();
        if (!Array.isArray(this.game?.map) || !Array.isArray(this.game.map[0])) {
            debug('[bullet] Warning: game.map is missing or malformed; terrain collisions disabled');
        }
    }

    listen(io) {
        this.io = io;
        debug("Starting Bullet Server");

        io.on("connection", (socket) => {
            socket.on('bullet_shot', (bullet) => {
                this.spawnBullet(socket, bullet);
            });
            socket.on('disconnect', () => {
                this.removeBulletsForShooter(socket.id);
            });
        });
    }

    parsePayload(payload) {
        if (payload === null || payload === undefined) {
            return null;
        }
        if (typeof payload === 'string') {
            try {
                return JSON.parse(payload);
            } catch (error) {
                debug("Failed to parse bullet payload: " + error.message);
                return null;
            }
        }
        if (typeof payload === 'object') {
            return payload;
        }
        return null;
    }

    spawnBullet(socket, payload) {
        const now = Date.now();
        const bulletData = this.sanitizeBullet(payload);
        if (!bulletData) {
            return;
        }

        const shooter = this.game.players[socket.id];
        if (!shooter) {
            return;
        }

        const teamId = (bulletData.teamId !== undefined && bulletData.teamId !== null)
            ? bulletData.teamId
            : (this.playerFactory?.getPlayerTeam(socket.id) ?? null);
        bulletData.teamId = teamId;

        if (bulletData.sourceId) {
            if (!this.canRegisterSourceShot(bulletData.sourceId, bulletData.sourceType, now)) {
                return;
            }
            this.registerSourceShot(bulletData.sourceId, now);
        }

        const defensiveShot = this.isStructureSource(bulletData);
        const shooterId = defensiveShot && bulletData.sourceId
            ? bulletData.sourceId
            : socket.id;

        const id = `bullet_${++bulletCounter}`;
        const bullet = decorateBulletMotion(Object.assign({
            id,
            shooterId,
            emitterId: socket.id,
            reportedShooterId: bulletData.reportedShooterId ?? null,
            damage: bulletData.damage ?? BULLET_DAMAGE,
            lifeMs: 0,
            maxRange: BULLET_MAX_RANGE,
            createdAt: now,
            lastUpdateAt: now,
        }, bulletData));

        this.bullets.set(id, bullet);

        if (this.io) {
            const broadcast = {
                shooter: shooterId,
                x: bullet.x,
                y: bullet.y,
                angle: bullet.angle,
                type: bullet.type,
                team: bullet.teamId
            };
            if (bullet.sourceId) {
                broadcast.sourceId = bullet.sourceId;
            }
            if (bullet.sourceType) {
                broadcast.sourceType = bullet.sourceType;
            }
            if (bullet.targetId) {
                broadcast.targetId = bullet.targetId;
            }
            this.io.emit('bullet_shot', JSON.stringify(broadcast));
        }
    }

    spawnSystemBullet(payload) {
        const now = Date.now();
        const bulletData = this.sanitizeBullet(payload);
        if (!bulletData) {
            return null;
        }

        const shooterId = (payload && typeof payload.shooterId === 'string' && payload.shooterId.length)
            ? payload.shooterId
            : ((payload && typeof payload.shooter === 'string' && payload.shooter.length)
                    ? payload.shooter
                    : (bulletData.sourceId || 'system'));

        const sourceId = bulletData.sourceId || shooterId;
        if (sourceId && !this.canRegisterSourceShot(sourceId, bulletData.sourceType, now)) {
            return null;
        }
        if (sourceId) {
            this.registerSourceShot(sourceId, now);
        }

        const id = `bullet_${++bulletCounter}`;
        const bullet = decorateBulletMotion(Object.assign({
            id,
            shooterId,
            emitterId: shooterId,
            reportedShooterId: bulletData.reportedShooterId ?? shooterId,
            damage: bulletData.damage ?? BULLET_DAMAGE,
            lifeMs: 0,
            maxRange: BULLET_MAX_RANGE,
            createdAt: now,
            lastUpdateAt: now,
        }, bulletData));

        this.bullets.set(id, bullet);

        if (this.io) {
            const broadcast = {
                shooter: shooterId,
                x: bullet.x,
                y: bullet.y,
                angle: bullet.angle,
                type: bullet.type,
                team: bullet.teamId
            };
            if (bullet.sourceId) {
                broadcast.sourceId = bullet.sourceId;
            } else if (sourceId && sourceId !== shooterId) {
                broadcast.sourceId = sourceId;
            }
            if (bullet.sourceType) {
                broadcast.sourceType = bullet.sourceType;
            }
            if (bullet.targetId) {
                broadcast.targetId = bullet.targetId;
            }
            this.io.emit('bullet_shot', JSON.stringify(broadcast));
        }

        return bullet;
    }

    sanitizeBullet(payload) {
        const data = this.parsePayload(payload);
        if (!data) {
            return null;
        }
        const x = Number(data.x);
        const y = Number(data.y);
        const angle = Number(data.angle);
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(angle)) {
            return null;
        }
        let type = Number(data.type);
        if (!Number.isFinite(type)) {
            type = 0;
        } else {
            type = Math.floor(type);
        }
        let teamId = null;
        const teamRaw = data.team ?? data.teamId;
        if (teamRaw !== undefined && teamRaw !== null) {
            const teamNumeric = Number(teamRaw);
            if (Number.isFinite(teamNumeric)) {
                teamId = Math.floor(teamNumeric);
            }
        }
        let sourceId = null;
        if (data.sourceId !== undefined && data.sourceId !== null) {
            const value = String(data.sourceId).trim();
            if (value.length > 0) {
                sourceId = value;
            }
        }
        let sourceType = null;
        if (typeof data.sourceType === 'string' && data.sourceType.length > 0) {
            sourceType = data.sourceType.trim().toLowerCase();
        }
        const damage = resolveBulletDamage(type);
        const reportedShooterId = (typeof data.shooter === 'string' && data.shooter.length > 0)
            ? data.shooter
            : null;
        const emitterId = (typeof data.emitterId === 'string' && data.emitterId.length > 0)
            ? data.emitterId
            : null;
        let targetId = null;
        if (data.targetId !== undefined && data.targetId !== null) {
            const value = String(data.targetId).trim();
            if (value.length > 0) {
                targetId = value;
            }
        }
        return {
            x,
            y,
            angle,
            type,
            speed: resolveBulletSpeed(type),
            teamId,
            sourceId,
            sourceType,
            damage,
            reportedShooterId,
            emitterId,
            targetId
        };
    }

    isStructureSource(data) {
        if (!data) {
            return false;
        }
        const type = data.sourceType ? String(data.sourceType).toLowerCase() : '';
        if (type === 'turret' || type === 'plasma' || type === 'sleeper' || type === 'rogue_tank' || type === 'fake_recruit' || type === 'city_recruit') {
            return true;
        }
        if (!type && typeof data.sourceId === 'string') {
            const lowered = data.sourceId.toLowerCase();
            if (lowered.startsWith('rogue_') || lowered.startsWith('fake_defense_') || lowered.startsWith('fake_recruit_')) {
                return true;
            }
        }
        return false;
    }

    removeBulletsForShooter(shooterId) {
        if (!shooterId) {
            return;
        }
        const removals = [];
        for (const [id, bullet] of this.bullets.entries()) {
            if (bullet.shooterId === shooterId || bullet.emitterId === shooterId) {
                removals.push(id);
            }
        }
        for (const id of removals) {
            this.bullets.delete(id);
        }
    }

    cycle(deltaMs) {
        if (this.bullets.size === 0) {
            return;
        }

        const now = Date.now();
        const removals = [];
        for (const bullet of this.bullets.values()) {
            this.updateBullet(bullet, deltaMs, now);
            if (bullet._destroy) {
                removals.push(bullet.id);
            }
        }
        if (removals.length > 0) {
            for (const id of removals) {
                this.bullets.delete(id);
            }
        }
    }

    updateBullet(bullet, deltaMs, now) {
        bullet.lifeMs += deltaMs;
        bullet.lastUpdateAt = now;

        const deltaX = bullet.velocityXPerMs * deltaMs;
        const deltaY = bullet.velocityYPerMs * deltaMs;
        const maxStep = bullet.maxVelocityPerMs * deltaMs;
        const stepCount = Math.max(1, Math.ceil(maxStep / 8));
        const stepX = deltaX / stepCount;
        const stepY = deltaY / stepCount;

        for (let index = 0; index < stepCount; index += 1) {
            const nextX = bullet.x + stepX;
            const nextY = bullet.y + stepY;
            const prevX = bullet.x;
            const prevY = bullet.y;
            bullet.x = nextX;
            bullet.y = nextY;

            const rect = this.getMutableBulletRect(bullet);
            this.clampRectToMap(rect);

            if (this.hitsBlockingTile(rect)) {
                bullet.x = prevX;
                bullet.y = prevY;
                bullet._destroy = true;
                if (debug.enabled) {
                    debug(`Bullet ${bullet.id} hit terrain at (${prevX.toFixed(1)}, ${prevY.toFixed(1)})`);
                }
                break;
            }

            if (this.hitsBuilding(rect, bullet)) {
                bullet.x = prevX;
                bullet.y = prevY;
                bullet._destroy = true;
                if (debug.enabled) {
                    debug(`Bullet ${bullet.id} hit structure at (${prevX.toFixed(1)}, ${prevY.toFixed(1)})`);
                }
                break;
            }
        }

        if (bullet._destroy) {
            return;
        }

        if (this.outOfBounds(bullet)) {
            bullet._destroy = true;
            return;
        }

        if (this.checkPlayerCollision(bullet)) {
            bullet._destroy = true;
        }
    }

    outOfBounds(bullet) {
        if (bullet.lifeMs > 4000) {
            return true;
        }
        if (!Number.isFinite(bullet.x) || !Number.isFinite(bullet.y)) {
            return true;
        }
        if (bullet.x < -256 || bullet.y < -256) {
            return true;
        }
        if (bullet.x > (512 * 48) + 256 || bullet.y > (512 * 48) + 256) {
            return true;
        }
        return false;
    }

    resolveSourceCooldown(sourceType) {
        if (!sourceType) {
            return 150;
        }
        const key = String(sourceType).toLowerCase();
        if (key === 'turret' || key === 'plasma' || key === 'sleeper') {
            return 220;
        }
        if (key === 'rogue_tank') {
            return 900;
        }
        if (key === 'fake_recruit' || key === 'city_recruit') {
            return 750;
        }
        return 150;
    }

    canRegisterSourceShot(sourceId, sourceType, now) {
        const cooldown = this.resolveSourceCooldown(sourceType);
        const lastShot = this.recentSourceShots.get(sourceId);
        if (lastShot !== undefined && (now - lastShot) < cooldown) {
            return false;
        }
        return true;
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
                if (BLOCKING_TILE_VALUES.has(value)) {
                    return true;
                }
            }
        }
        return false;
    }

    getBuildingFootprint(building) {
        if (!building) {
            return {
                width: DEFAULT_BUILDING_WIDTH_TILES,
                height: DEFAULT_BUILDING_HEIGHT_TILES
            };
        }
        const explicitWidth = Number.isFinite(building.width) ? building.width : null;
        const explicitHeight = Number.isFinite(building.height) ? building.height : null;
        if (explicitWidth !== null && explicitHeight !== null) {
            return { width: explicitWidth, height: explicitHeight };
        }
        const numericType = Number(building.type);
        if (Number.isFinite(numericType)) {
            if (isCommandCenter(numericType) || isHospital(numericType)) {
                return {
                    width: COMMAND_CENTER_WIDTH_TILES,
                    height: COMMAND_CENTER_HEIGHT_TILES
                };
            }
            if (isHouse(numericType)) {
                return { width: 1, height: 1 };
            }
        }
        return {
            width: DEFAULT_BUILDING_WIDTH_TILES,
            height: DEFAULT_BUILDING_HEIGHT_TILES
        };
    }

    hasOpenBay(building) {
        const numericType = Number(building?.type);
        if (!Number.isFinite(numericType)) {
            return false;
        }
        return isCommandCenter(numericType) || isHospital(numericType);
    }

    createBuildingHitboxes(building) {
        const tileX = Number.isFinite(building.x) ? Math.floor(building.x) : null;
        const tileY = Number.isFinite(building.y) ? Math.floor(building.y) : null;
        if (tileX === null || tileY === null) {
            return [];
        }

        const footprint = this.getBuildingFootprint(building);
        const widthTiles = Math.max(1, Number.isFinite(footprint.width) ? footprint.width : DEFAULT_BUILDING_WIDTH_TILES);
        const heightTiles = Math.max(1, Number.isFinite(footprint.height) ? footprint.height : DEFAULT_BUILDING_HEIGHT_TILES);

        const cacheKey = `${tileX}|${tileY}|${widthTiles}|${heightTiles}|${Number(building.type) || 0}`;
        const cached = this.buildingHitboxCache.get(building);
        if (cached && cached.key === cacheKey) {
            return cached.hitboxes;
        }

        const baseRect = {
            x: (tileX * TILE_SIZE) + BULLET_BUILDING_PADDING,
            y: (tileY * TILE_SIZE) + BULLET_BUILDING_PADDING,
            w: Math.max(TILE_SIZE * widthTiles - (BULLET_BUILDING_PADDING * 2), 8),
            h: Math.max(TILE_SIZE * heightTiles - (BULLET_BUILDING_PADDING * 2), 8)
        };

        if (!this.hasOpenBay(building) || heightTiles <= OPEN_BAY_HEIGHT_TILES) {
            const hitboxes = [baseRect];
            this.buildingHitboxCache.set(building, { key: cacheKey, hitboxes });
            return hitboxes;
        }

        const walkwayTiles = Math.min(OPEN_BAY_HEIGHT_TILES, Math.max(heightTiles - 1, 0));
        if (walkwayTiles <= 0) {
            const hitboxes = [baseRect];
            this.buildingHitboxCache.set(building, { key: cacheKey, hitboxes });
            return hitboxes;
        }

        const blockedTiles = heightTiles - walkwayTiles;
        if (blockedTiles <= 0) {
            const hitboxes = [];
            this.buildingHitboxCache.set(building, { key: cacheKey, hitboxes });
            return hitboxes;
        }

        const topBlockedTiles = Math.ceil(blockedTiles / 2);
        const bottomBlockedTiles = blockedTiles - topBlockedTiles;
        const hitboxes = [];

        if (topBlockedTiles > 0) {
            const blockedHeight = Math.max((topBlockedTiles * TILE_SIZE) - BULLET_BUILDING_PADDING, 8);
            hitboxes.push(Object.assign({}, baseRect, {
                h: Math.min(baseRect.h, blockedHeight)
            }));
        }

        if (bottomBlockedTiles > 0) {
            const offsetTiles = topBlockedTiles + walkwayTiles;
            const offsetPixels = offsetTiles * TILE_SIZE;
            const blockedHeight = Math.max((bottomBlockedTiles * TILE_SIZE) - BULLET_BUILDING_PADDING, 8);
            const remainingHeight = Math.max(0, baseRect.h - offsetPixels);
            if (remainingHeight > 0) {
                hitboxes.push(Object.assign({}, baseRect, {
                    y: baseRect.y + offsetPixels,
                    h: Math.min(remainingHeight, blockedHeight)
                }));
            }
        }

        this.buildingHitboxCache.set(building, { key: cacheKey, hitboxes });
        return hitboxes;
    }

    shouldDestroyBuildingOnHit(building, bullet) {
        if (!building || !bullet) {
            return false;
        }

        const population = Number.isFinite(building.population) ? building.population : 0;
        if (population > 0) {
            return false;
        }

        // Only lasers (type 0) and rockets (type 1) should destroy empty structures
        return bullet.type === 0 || bullet.type === 1;
    }

    hitsBuilding(rect, bullet = null) {
        if (!rect) {
            return false;
        }
        const factory = this.game?.buildingFactory;
        if (!factory || !factory.buildings || typeof factory.buildings.values !== 'function') {
            return false;
        }
        for (const building of factory.buildings.values()) {
            if (!building) {
                continue;
            }
            const hitboxes = this.createBuildingHitboxes(building);
            for (const hitbox of hitboxes) {
                if (rectangleCollision(rect, hitbox)) {
                    if (this.shouldDestroyBuildingOnHit(building, bullet)) {
                        factory.removeBuilding(building.id, true);
                    }
                    return true;
                }
            }
        }
        return false;
    }

    getMutableBulletRect(bullet) {
        if (!bullet.rect) {
            bullet.rect = {
                x: bullet.x,
                y: bullet.y,
                w: 4,
                h: 4
            };
        } else {
            bullet.rect.x = bullet.x;
            bullet.rect.y = bullet.y;
        }
        return bullet.rect;
    }

    clampRectToMap(rect) {
        rect.x = Math.max(0, Math.min(rect.x, MAP_PIXEL_SIZE - rect.w));
        rect.y = Math.max(0, Math.min(rect.y, MAP_PIXEL_SIZE - rect.h));
        return rect;
    }

    checkTerrainCollision(bullet) {
        const rect = this.clampRectToMap(this.getMutableBulletRect(bullet));
        return this.hitsBlockingTile(rect);
    }

    checkStructureCollision(bullet) {
        const rect = this.clampRectToMap(this.getMutableBulletRect(bullet));
        return this.hitsBuilding(rect, bullet);
    }

    registerSourceShot(sourceId, now) {
        this.recentSourceShots.set(sourceId, now);
        if ((now - this.sourceCleanupAt) > 10000) {
            this.cleanupSourceShots(now);
        }
    }

    cleanupSourceShots(now = Date.now()) {
        const threshold = now - 10000;
        for (const [id, timestamp] of this.recentSourceShots.entries()) {
            if (timestamp < threshold) {
                this.recentSourceShots.delete(id);
            }
        }
        this.sourceCleanupAt = now;
    }

    checkPlayerCollision(bullet) {
        const bulletRect = this.getMutableBulletRect(bullet);
        for (const [socketId, player] of Object.entries(this.game.players)) {
            if (!player || !player.offset) {
                continue;
            }
            if (socketId === bullet.shooterId && !this.isSelfDamageAllowed(bullet)) {
                continue;
            }

            const playerTeam = this.playerFactory?.getPlayerTeam(socketId) ?? null;
            const bulletTeam = bullet.teamId ?? null;
            if (bulletTeam !== null && bulletTeam === playerTeam) {
                continue;
            }

            const playerRect = getPlayerRect(player);
            if (rectangleCollision(playerRect, bulletRect)) {
                this.playerFactory.applyDamage(socketId, bullet.damage, {
                    type: "bullet",
                    shooterId: bullet.shooterId,
                    emitterId: bullet.emitterId ?? null,
                    sourceId: bullet.sourceId ?? null,
                    sourceType: bullet.sourceType ?? null,
                    teamId: bullet.teamId ?? null,
                    targetId: bullet.targetId ?? null
                });
                return true;
            }
        }
        return false;
    }

    isSelfDamageAllowed(bullet) {
        if (!bullet) {
            return false;
        }
        return this.isStructureSource(bullet);
    }
}

module.exports = BulletFactory;
