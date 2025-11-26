import { MOVEMENT_SPEED_PLAYER, ITEM_TYPE_BOMB, ITEM_TYPE_MINE, ITEM_TYPE_DFG } from '../constants.js';
import WasmPathfinder from './WasmPathfinder.js';
import { normalizeVector, vectorToDirection, directionToVector, tryStep, findAlternateVector, clampDelta } from '../bots/movement-utils.js';
import { createBlockingChecker } from '../bots/collision.js';

console.log('[DefenderBot] *** MODULE LOADED ***');

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
const MINE_PLACE_INTERVAL = 8000;
const MINE_PLACE_RADIUS = TILE_SIZE * 5;
const KITE_DISTANCE = TILE_SIZE * 1.5; // tighter so they stay in your face
const BOMB_DEFUSE_RANGE = TILE_SIZE * 8;
const TARGET_REFRESH_INTERVAL = 1800;
const PATHFIND_INTERVAL = 1000; // Recalculate path a bit less to reduce churn
const AVOIDANCE_ANGLES = Object.freeze([Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2]);

const DEFENDER_ROLES = Object.freeze({
    MAYOR: 'mayor',
    SHOOTER: 'shooter',
    BOMB_DEFUSER: 'bomb_defuser',
    MINER: 'miner'
});

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

    constructor(game) {
        this.game = game;
        this.defenders = [];
        this.nextId = 1;
        this.nextSpawnCheck = 0;
        this.cityDefenders = new Map(); // cityId -> Set of defender IDs
        this.instancePrefix = `defender_${Math.random().toString(16).slice(-6)}`;
        this.pathfinder = new WasmPathfinder(game);
        this.blocking = createBlockingChecker(game, (entity) => {
            if (entity && typeof entity === 'object') {
                return { teamId: entity.cityId ?? null, ownerId: entity.id ?? null };
            }
            return { teamId: null, ownerId: null };
        });
        this.debugEnabled = false;
        this.debugLastEmit = 0;
        this.socketEventsBound = false;
        this.handleCityOrbed = this.handleCityOrbed.bind(this);
        this.bindSocketEvents();
    }

    createDefenderId() {
        const id = `${this.instancePrefix}_${this.nextId}`;
        this.nextId += 1;
        return id;
    }

    update() {
        this.debugEnabled = !!this.game?.debugMode;

        if (!this.game || !this.game.buildingFactory) {
            return;
        }

        const now = this.game.tick || Date.now();

        if (now >= this.nextSpawnCheck) {
            this.nextSpawnCheck = now + SPAWN_CHECK_INTERVAL;
            console.log('[DefenderBot] Running evaluateSpawns');
            this.evaluateSpawns(now);
        }

        this.pruneDefendersOutsideCityLimit();
        this.updateDefenders(now);
        this.emitDebugPaths(now);
    }

    evaluateSpawns(now) {
        const timestamp = Number.isFinite(now) ? now : (this.game.tick || Date.now());
        const cities = this.game.cities || [];
        const playerCity = this.game.player?.city;

        if (this.defenders.length >= MAX_TOTAL_DEFENDERS) {
            return;
        }

        if (!cities.length || !Number.isFinite(playerCity)) {
            return;
        }

        // Only spawn defenders for the single nearest eligible fake city, and cap total defenders.
        let bestCity = null;
        let bestCityIndex = null;
        let bestDistSq = Infinity;

        cities.forEach((city, cityIndex) => {
            if (!city || cityIndex === playerCity) {
                return; // Skip player's own city
            }
            if (!city.isFakeCandidate) {
                return;
            }

            const cityX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
            const cityY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
            const playerX = this.game.player.offset?.x || 0;
            const playerY = this.game.player.offset?.y || 0;
            const distSq = distanceSquared(playerX + HALF_TILE, playerY + HALF_TILE, cityX, cityY);
            if (distSq > (ENGAGEMENT_RADIUS * ENGAGEMENT_RADIUS)) {
                return;
            }

            const hasHumans = Object.values(this.game.otherPlayers || {}).some(player => {
                return player && player.city === cityIndex && !player.isBot;
            });
            if (hasHumans) {
                return;
            }

            const existing = this.cityDefenders.get(cityIndex);
            if (existing && existing.size >= MAX_DEFENDERS_PER_CITY) {
                return;
            }

            if (distSq < bestDistSq) {
                bestDistSq = distSq;
                bestCity = city;
                bestCityIndex = cityIndex;
            }
        });

        if (bestCity !== null && bestCityIndex !== null) {
            const remainingSlots = Math.max(0, MAX_TOTAL_DEFENDERS - this.defenders.length);
            if (remainingSlots > 0) {
                console.log(`[DefenderBot] ✅ Spawning defenders for nearest city ${bestCityIndex}! (remaining slots ${remainingSlots})`);
                this.spawnDefendersForCity(bestCity, bestCityIndex, timestamp, remainingSlots);
            }
        }
    }

    spawnDefendersForCity(city, cityId, now, maxNew = MAX_DEFENDERS_PER_CITY) {
        const existing = this.cityDefenders.get(cityId) || new Set();
        if (existing.size >= MAX_DEFENDERS_PER_CITY) {
            return;
        }

        const roles = [
            DEFENDER_ROLES.MAYOR,
            DEFENDER_ROLES.SHOOTER,
            DEFENDER_ROLES.BOMB_DEFUSER,
            DEFENDER_ROLES.MINER
        ];

        const centerX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
        const centerY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);

        let spawnedCount = 0;
        roles.forEach((role, index) => {
            if (existing.size >= MAX_DEFENDERS_PER_CITY || spawnedCount >= maxNew || this.defenders.length >= MAX_TOTAL_DEFENDERS) {
                return;
            }

            // Randomize spawn positions instead of cardinal directions
            const baseAngle = (index / MAX_DEFENDERS_PER_CITY) * Math.PI * 2;
            const randomOffset = (Math.random() - 0.5) * (Math.PI / 2); // ±45 degrees
            const angle = baseAngle + randomOffset;
            const spawnRadius = TILE_SIZE * 12; // Spawn FAR outside city (12 tiles) to avoid walls
            const idealX = centerX + Math.cos(angle) * spawnRadius;
            const idealY = centerY + Math.sin(angle) * spawnRadius;

            // Find free spawn position
            const spawnPos = this.findFreeSpawnPosition(idealX, idealY);
            if (!spawnPos) {
                console.warn(`[DefenderBot] Could not find free spawn position for ${role} at city ${cityId}`);
                return; // Can't find a free spot for this bot
            }

            console.log(`[DefenderBot] Spawning ${role} at (${Math.round(spawnPos.x)}, ${Math.round(spawnPos.y)}) for city ${cityId}`);

            const defenderId = this.createDefenderId();
            const defender = {
                id: defenderId,
                role: role,
                cityId: cityId,
                offset: { x: spawnPos.x, y: spawnPos.y },
                lastSafeOffset: { x: spawnPos.x, y: spawnPos.y },
                direction: Math.floor(Math.random() * 32),
                isMoving: 0,
                target: null,
                path: null, // A* path waypoints
                waypointIndex: 0, // Current waypoint being targeted
                nextPathfind: now, // When to recalculate path
                nextDecisionAt: now + Math.random() * 500,
                nextTargetRefresh: now + Math.random() * 500,
                fireCooldown: now + 1000 + Math.random() * 500,
                minePlaceCooldown: now + 3000 + Math.random() * 2000,
                spawnedAt: now,
                city: cityId,
                health: 20,
                cachedVector: null,
                isMayor: role === DEFENDER_ROLES.MAYOR,
                callsign: this.getRoleLabel(role),
                isDefenderBot: true, // Mark as client-side only entity
                isBot: true // Prevent server validation
            };

            this.defenders.push(defender);
            existing.add(defenderId);
            this.cityDefenders.set(cityId, existing);
            this.game.forceDraw = true;
            spawnedCount += 1;
        });
    }

    findFreeSpawnPosition(idealX, idealY) {
        const mapMax = (512 * TILE_SIZE) - TILE_SIZE;

        // Clamp to map bounds
        let x = Math.max(HALF_TILE, Math.min(idealX, mapMax));
        let y = Math.max(HALF_TILE, Math.min(idealY, mapMax));

        console.log(`[DefenderBot] Trying to spawn at ideal position (${Math.round(x)}, ${Math.round(y)})`);

        // Check if ideal position is free
        if (!this.blocking.isBlocked(x, y)) {
            console.log(`[DefenderBot] Ideal position is free!`);
            return { x, y };
        }

        console.log(`[DefenderBot] Ideal position blocked, searching...`);

        // Search in expanding spiral - much larger range
        const searchRadii = [];
        const maxSearchTiles = 20; // allow up to ~20 tiles of drift to escape blocked rings
        for (let i = 1; i <= maxSearchTiles; i += 1) {
            searchRadii.push(TILE_SIZE * i);
        }
        const directions = [
            { dx: 1, dy: 0 },   // right
            { dx: -1, dy: 0 },  // left
            { dx: 0, dy: 1 },   // down
            { dx: 0, dy: -1 },  // up
            { dx: 1, dy: 1 },   // down-right
            { dx: -1, dy: 1 },  // down-left
            { dx: 1, dy: -1 },  // up-right
            { dx: -1, dy: -1 }  // up-left
        ];

        for (const radius of searchRadii) {
            for (const dir of directions) {
                const candidateX = Math.max(HALF_TILE, Math.min(x + dir.dx * radius, mapMax));
                const candidateY = Math.max(HALF_TILE, Math.min(y + dir.dy * radius, mapMax));

                if (!this.blocking.isBlocked(candidateX, candidateY)) {
                    console.log(`[DefenderBot] Found free position at (${Math.round(candidateX)}, ${Math.round(candidateY)}) after searching radius ${radius / TILE_SIZE} tiles`);
                    return { x: candidateX, y: candidateY };
                }
            }
        }

        // Random scatter fallback inside the extended search radius
        const scatterAttempts = 30;
        for (let attempt = 0; attempt < scatterAttempts; attempt += 1) {
            const angle = Math.random() * Math.PI * 2;
            const radiusTiles = 4 + (Math.random() * (maxSearchTiles - 4));
            const radius = radiusTiles * TILE_SIZE;
            const candidateX = Math.max(HALF_TILE, Math.min(x + Math.cos(angle) * radius, mapMax));
            const candidateY = Math.max(HALF_TILE, Math.min(y + Math.sin(angle) * radius, mapMax));
            if (!this.blocking.isBlocked(candidateX, candidateY)) {
                console.log(`[DefenderBot] Scatter found free position at (${Math.round(candidateX)}, ${Math.round(candidateY)}) after ${attempt + 1} attempts`);
                return { x: candidateX, y: candidateY };
            }
        }

        console.warn(`[DefenderBot] No free position found after searching up to ${maxSearchTiles} tiles and scatter attempts`);
        // No free position found
        return null;
    }

    getRoleLabel(role) {
        switch (role) {
            case DEFENDER_ROLES.MAYOR: return 'Mayor';
            case DEFENDER_ROLES.SHOOTER: return 'Defender';
            case DEFENDER_ROLES.BOMB_DEFUSER: return 'Demolitionist';
            case DEFENDER_ROLES.MINER: return 'Engineer';
            default: return 'Recruit';
        }
    }

    updateDefenders(now) {
        if (this.defenders.length > 0 && this.game?.debugMode) {
            console.log(`[DefenderBot] Updating ${this.defenders.length} defenders`);
        }

        for (let i = this.defenders.length - 1; i >= 0; i -= 1) {
            const defender = this.defenders[i];
            if (!defender) {
                this.defenders.splice(i, 1);
                continue;
            }

            // Stagger disabled (stride=1) to keep speed parity with players

            // Remove if player left the area or city is no longer valid
            const city = this.game.cities?.[defender.cityId];
            if (!city) {
                this.removeDefenderAtIndex(i);
                continue;
            }

            this.refreshTarget(defender, now);

            // Ensure target is never null; if it is, force an immediate refresh
            if (!defender.target) {
                defender.nextTargetRefresh = 0;
                this.refreshTarget(defender, now);
            }

            this.updateMovement(defender, now);

            switch (defender.role) {
                case DEFENDER_ROLES.MAYOR:
                    this.updateMayorBehavior(defender, now);
                    break;
                case DEFENDER_ROLES.SHOOTER:
                    this.updateShooterBehavior(defender, now);
                    break;
                case DEFENDER_ROLES.BOMB_DEFUSER:
                    this.updateBombDefuserBehavior(defender, now);
                    break;
                case DEFENDER_ROLES.MINER:
                    this.updateMinerBehavior(defender, now);
                    break;
            }
        }
    }

    refreshTarget(defender, now) {
        if (now < defender.nextTargetRefresh) {
            return;
        }
        defender.nextTargetRefresh = now + TARGET_REFRESH_INTERVAL + Math.random() * 1000;

        let target = null;

        switch (defender.role) {
            case DEFENDER_ROLES.MAYOR:
                target = this.findDestroyedBuilding(defender);
                break;
            case DEFENDER_ROLES.SHOOTER:
                target = this.findPlayerTarget(defender);
                break;
            case DEFENDER_ROLES.BOMB_DEFUSER:
                target = this.findEnemyBomb(defender);
                break;
            case DEFENDER_ROLES.MINER:
                target = this.findMinePosition(defender);
                break;
        }

        // DEFAULT BEHAVIOR: If no specific task, hunt the player!
        if (!target) {
            target = this.findPlayerTarget(defender);
            target.kind = 'player_fallback'; // Mark as fallback so shooter behavior applies
        }

        defender.target = target || this.findPlayerTarget(defender);
    }

    findPlayerTarget(_defender) {
        const playerX = this.game.player.offset?.x || 0;
        const playerY = this.game.player.offset?.y || 0;
        return {
            kind: 'player',
            x: playerX + HALF_TILE,
            y: playerY + HALF_TILE
        };
    }

    findEnemyBomb(defender) {
        const manager = this.game.itemFactory;
        if (!manager) {
            return null;
        }

        let node = manager.getHead();
        let closest = null;
        let closestDist = BOMB_DEFUSE_RANGE * BOMB_DEFUSE_RANGE;

        while (node) {
            if (node.type === ITEM_TYPE_BOMB && node.armed && node.city !== defender.cityId) {
                const distSq = distanceSquared(
                    node.x + HALF_TILE,
                    node.y + HALF_TILE,
                    defender.offset.x + HALF_TILE,
                    defender.offset.y + HALF_TILE
                );
                if (distSq < closestDist) {
                    closestDist = distSq;
                    closest = {
                        kind: 'bomb',
                        id: node.id,
                        x: node.x + HALF_TILE,
                        y: node.y + HALF_TILE
                    };
                }
            }
            node = node.next;
        }

        return closest;
    }

    findDestroyedBuilding(_defender) {
        // No rebuild targets tracked yet; force fallback to player
        return null;
    }

    findMinePosition(_defender) {
        // Predict where player is going
        const playerX = this.game.player.offset?.x || 0;
        const playerY = this.game.player.offset?.y || 0;
        const playerDir = this.game.player.direction || 0;
        const vec = directionToVector(playerDir);

        // Place mine ahead of player
        const ahead = TILE_SIZE * 4;
        return {
            kind: 'mine_spot',
            x: playerX + vec.dx * ahead,
            y: playerY + vec.dy * ahead
        };
    }

    pickPatrolPoint(cityId) {
        const city = this.game.cities?.[cityId];
        const baseX = toFinite(city?.x, 0) + (TILE_SIZE * 1.5);
        const baseY = toFinite(city?.y, 0) + (TILE_SIZE * 1.5);
        const angle = Math.random() * Math.PI * 2;
        const radius = (TILE_SIZE * 2) + (Math.random() * TILE_SIZE * 5);
        return {
            kind: 'point',
            x: baseX + Math.cos(angle) * radius,
            y: baseY + Math.sin(angle) * radius
        };
    }

    updateMayorBehavior(defender, now) {
        // Act like a shooter for now (no rebuild logic yet)
        this.updateShooterBehavior(defender, now);
    }

    updateShooterBehavior(defender, now) {
        if (now < defender.fireCooldown) {
            return;
        }

        const target = defender.target;
        // Accept both 'player' and 'player_fallback' targets
        if (!target || (target.kind !== 'player' && target.kind !== 'player_fallback')) {
            return;
        }

        // Check distance and kite if too close
        const distSq = distanceSquared(
            defender.offset.x + HALF_TILE,
            defender.offset.y + HALF_TILE,
            target.x,
            target.y
        );

        const tooClose = distSq < (KITE_DISTANCE * KITE_DISTANCE);
        if (tooClose) {
            // Move away from player
            const dx = defender.offset.x - target.x;
            const dy = defender.offset.y - target.y;
            const escapePoint = {
                kind: 'point',
                x: defender.offset.x + dx * 2,
                y: defender.offset.y + dy * 2
            };
            defender.target = escapePoint;
            // Even while backing up, keep firing to stay dangerous
            if (now >= defender.fireCooldown) {
                this.tryShoot(defender, target, now);
            }
            return;
        }

        // Shoot if in range
        const inRange = distSq <= (SHOOT_RANGE * SHOOT_RANGE);
        if (inRange) {
            this.tryShoot(defender, target, now);
        } else {
            // Aggressive potshots just outside normal range
            const extendedRange = SHOOT_RANGE * 1.5;
            if (distSq <= (extendedRange * extendedRange)) {
                this.tryShoot(defender, target, now);
            }
        }
    }

    updateBombDefuserBehavior(defender, now) {
        const target = defender.target;

        // If no bomb, act like a shooter
        if (!target || target.kind === 'player_fallback') {
            this.updateShooterBehavior(defender, now);
            return;
        }

        if (target.kind !== 'bomb') {
            return;
        }

        // If close enough, shoot the bomb
        const distSq = distanceSquared(
            defender.offset.x + HALF_TILE,
            defender.offset.y + HALF_TILE,
            target.x,
            target.y
        );

        if (distSq <= (SHOOT_RANGE * SHOOT_RANGE * 0.7)) {
            this.tryShoot(defender, target, now);
        }
    }

    updateMinerBehavior(defender, now) {
        if (now < defender.minePlaceCooldown) {
            // While on cooldown, act like a shooter
            if (defender.target && defender.target.kind === 'player_fallback') {
                this.updateShooterBehavior(defender, now);
            }
            return;
        }

        const target = defender.target;

        // If not trying to place mine, act like a shooter
        if (!target || target.kind === 'player_fallback') {
            this.updateShooterBehavior(defender, now);
            return;
        }

        if (target.kind !== 'mine_spot') {
            return;
        }

        // Check if close enough to place mine
        const distSq = distanceSquared(
            defender.offset.x + HALF_TILE,
            defender.offset.y + HALF_TILE,
            target.x,
            target.y
        );

        if (distSq <= (MINE_PLACE_RADIUS * MINE_PLACE_RADIUS)) {
            this.tryPlaceMine(defender, now, target);
        }
    }

    tryShoot(defender, target, now) {
        if (now < defender.fireCooldown) {
            return;
        }
        const socketListener = this.game?.socketListener;
        if (!socketListener || typeof socketListener.sendBulletShot !== 'function') {
            return;
        }
        const shooterId = this.game.player?.id ?? null;
        if (!shooterId) {
            return;
        }

        const dx = target.x - (defender.offset.x + HALF_TILE);
        const dy = target.y - (defender.offset.y + HALF_TILE);
        const direction = vectorToDirection(dx, dy, defender.direction);
        const vec = directionToVector(direction);
        const originX = (defender.offset.x + HALF_TILE) + (vec.dx * 30);
        const originY = (defender.offset.y + HALF_TILE) + (vec.dy * 30);

        this.game.bulletFactory.newBullet(defender.id, originX, originY, 0, -direction, defender.city ?? null, {
            sourceType: 'defender_bot',
            targetId: target?.id ?? null
        });
        this.emitDefenderShot(defender, originX, originY, direction);
        defender.fireCooldown = now + SHOOT_INTERVAL + Math.random() * 600;
    }

    tryPlaceMine(defender, now, target) {
        const mineType = Math.random() < 0.6 ? ITEM_TYPE_MINE : ITEM_TYPE_DFG;
        const centerX = defender.offset.x + HALF_TILE;
        const centerY = defender.offset.y + HALF_TILE;

        const desiredVector = target
            ? normalizeVector(target.x - centerX, target.y - centerY)
            : (defender.cachedVector || directionToVector(defender.direction));
        const dropDistance = TILE_SIZE * 1.5;
        const desiredX = centerX + desiredVector.dx * dropDistance;
        const desiredY = centerY + desiredVector.dy * dropDistance;
        const placement = this.findSafeHazardPlacement(defender, desiredX, desiredY);

        if (!placement) {
            return;
        }

        const item = this.game.itemFactory?.newItem(
            { id: defender.id, city: defender.cityId ?? null },
            placement.x,
            placement.y,
            mineType,
            { notifyServer: false }
        );

        if (item) {
            item.active = true;
            defender.minePlaceCooldown = now + MINE_PLACE_INTERVAL + Math.random() * 3000;
            this.game.forceDraw = true;
        }
    }

    findSafeHazardPlacement(defender, desiredX, desiredY) {
        const minSeparationSq = (TILE_SIZE * 0.9) * (TILE_SIZE * 0.9);
        const maxSeparationSq = (TILE_SIZE * 4) * (TILE_SIZE * 4);
        const origin = {
            x: defender.offset.x + HALF_TILE,
            y: defender.offset.y + HALF_TILE
        };

        const candidates = [];
        const radii = [0, TILE_SIZE * 1.5, TILE_SIZE * 2.5];
        const angles = [0, Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, Math.PI];

        radii.forEach((radius) => {
            angles.forEach((angle) => {
                const x = desiredX + Math.cos(angle) * radius;
                const y = desiredY + Math.sin(angle) * radius;
                candidates.push({ x, y });
            });
        });

        for (const candidate of candidates) {
            const distSq = distanceSquared(origin.x, origin.y, candidate.x, candidate.y);
            if (distSq < minSeparationSq || distSq > maxSeparationSq) {
                continue;
            }
            if (this.blocking.isBlocked(candidate.x, candidate.y, defender)) {
                continue;
            }
            return candidate;
        }

        return null;
    }

    emitDefenderShot(_defender, _originX, _originY, _direction) {
        // Defender bots are CLIENT-SIDE ONLY - do NOT send their shots to the server
        // This prevents the server from creating player records for defender IDs
        // which would then require movement validation and cause errors

        // Other players won't see defender bot bullets, but since defenders
        // only exist when the player is attacking solo, there are no other players
        // to see them anyway!

        return; // Don't send to server
    }

    emitDebugPaths(now) {
        if (!this.debugEnabled) {
            return;
        }
        const throttleMs = 250;
        if (this.debugLastEmit && now < this.debugLastEmit + throttleMs) {
            return;
        }
        this.debugLastEmit = now;
        const payload = this.defenders.map((d) => ({
            id: d.id,
            path: d.path || null
        }));
        if (typeof this.game?.socketListener?.emit === 'function') {
            this.game.socketListener.emit('bot:debug:defenders', payload);
        } else {
            this.game.__defenderDebug = payload;
        }
    }

    updateMovement(defender, now) {
        const target = this.resolveTargetPosition(defender.target);
        if (!target) {
            defender.isMoving = 0;
            defender.path = null;
            return;
        }

        const mask = this.pathfinder.navMask.getMask(750, {
            centerX: target.x,
            centerY: target.y,
            radiusTiles: 40
        });
        const approach = this.pickApproachPoint(defender, target, mask);
        const goalX = approach.x;
        const goalY = approach.y;

        // If we're already sitting close enough to the goal, avoid churning new paths.
        const arrivalRadius = TILE_SIZE * 0.75;
        const goalDistSq = distanceSquared(
            defender.offset.x + HALF_TILE,
            defender.offset.y + HALF_TILE,
            goalX,
            goalY
        );
        if (goalDistSq <= (arrivalRadius * arrivalRadius)) {
            defender.isMoving = 0;
            defender.path = null;
            defender.pendingPathRequest = null;
            defender.cachedVector = null;
            defender.nextPathfind = now + PATHFIND_INTERVAL;
            return;
        }

        // Recalculate path periodically or if no path exists
        if (!defender.pendingPathRequest && (!defender.path || now >= defender.nextPathfind)) {
            const defenderX = defender.offset.x + HALF_TILE;
            const defenderY = defender.offset.y + HALF_TILE;
            const requestId = (this.nextPathRequestId || 0) + 1;
            this.nextPathRequestId = requestId;
            defender.pendingPathRequest = requestId;

            this.pathfinder.findPath(defenderX, defenderY, goalX, goalY).then((path) => {
                if (defender.pendingPathRequest !== requestId) {
                    return;
                }
                if (path && path.length > 1) {
                    defender.path = path;
                    defender.waypointIndex = 1; // Skip first waypoint (current position)
                    defender.nextPathfind = now + (PATHFIND_INTERVAL * 1.6); // stick with a path longer to reduce churn
                } else {
                    defender.path = null;
                    defender.nextPathfind = now + 900; // Try again soon
                }
            }).finally(() => {
                if (defender.pendingPathRequest === requestId) {
                    defender.pendingPathRequest = null;
                }
            });
        }

        // Follow path if we have one
        if (defender.path && defender.waypointIndex < defender.path.length) {
            const waypoint = defender.path[defender.waypointIndex];
            const dx = waypoint.x - (defender.offset.x + HALF_TILE);
            const dy = waypoint.y - (defender.offset.y + HALF_TILE);
            const distSq = (dx * dx) + (dy * dy);

            // Reached waypoint?
            const reachRadius = TILE_SIZE * 1.0; // tile-based step
            if (distSq < (reachRadius * reachRadius)) {
                defender.waypointIndex++;
                defender.minRunFrames = 0;
                if (defender.waypointIndex >= defender.path.length) {
                    // Reached end of path
                    defender.path = null;
                    defender.nextPathfind = now + PATHFIND_INTERVAL;
                    defender.isMoving = 0;
                    return;
                }
                return; // Move to next waypoint next frame
            }

            // Move toward waypoint
            const vector = normalizeVector(dx, dy);
            defender.cachedVector = vector;
            defender.direction = vectorToDirection(vector.dx, vector.dy, defender.direction);

            const delta = clampDelta(this.game.timePassed);
            const step = delta * MOVEMENT_SPEED_PLAYER * BASE_SPEED_MULTIPLIER;

            if (tryStep(defender, vector, step, (x, y) => this.blocking.isBlocked(x, y, defender))) {
                defender.isMoving = 1;
                defender.stuckCount = 0;
            } else {
                defender.isMoving = 0;
                defender.stuckCount = (defender.stuckCount || 0) + 1;
                if (defender.stuckCount >= 3) {
                    defender.path = null;
                    defender.nextPathfind = now; // force fast retry after a few stalls
                }
            }
        } else {
            // No path - try direct movement as fallback
            const dx = goalX - (defender.offset.x + HALF_TILE);
            const dy = goalY - (defender.offset.y + HALF_TILE);
            const vector = normalizeVector(dx, dy);

            if (goalDistSq <= (arrivalRadius * arrivalRadius)) {
                defender.isMoving = 0;
                defender.path = null;
                defender.cachedVector = null;
                defender.nextPathfind = now + PATHFIND_INTERVAL;
                return;
            }

            defender.direction = vectorToDirection(vector.dx, vector.dy, defender.direction);
            const delta = clampDelta(this.game.timePassed);
            const step = delta * MOVEMENT_SPEED_PLAYER * BASE_SPEED_MULTIPLIER;

            if (tryStep(defender, vector, step, (x, y) => this.blocking.isBlocked(x, y, defender))) {
                defender.isMoving = 1;
                defender.stuckCount = 0;
            } else {
                const alternate = findAlternateVector(defender, vector, step, AVOIDANCE_ANGLES, (x, y) => this.blocking.isBlocked(x, y, defender));
                if (alternate && tryStep(defender, alternate, step, (x, y) => this.blocking.isBlocked(x, y, defender))) {
                    defender.cachedVector = alternate;
                    defender.direction = vectorToDirection(alternate.dx, alternate.dy, defender.direction);
                    defender.isMoving = 1;
                    defender.stuckCount = 0;
                } else {
                    defender.isMoving = 0;
                    defender.stuckCount = (defender.stuckCount || 0) + 1;
                    if (defender.stuckCount >= 4) {
                        defender.target = this.pickPatrolPoint(defender.cityId);
                        defender.nextPathfind = now;
                        defender.stuckCount = 0;
                    }
                }
            }
        }
    }

    applyMovement(defender, now, vector) {
        if (!vector || !Number.isFinite(vector.dx) || !Number.isFinite(vector.dy)) {
            defender.isMoving = 0;
            return false;
        }
        if (Math.abs(vector.dx) < 1e-4 && Math.abs(vector.dy) < 1e-4) {
            defender.isMoving = 0;
            return false;
        }
        const delta = clampDelta(this.game.timePassed);
        const step = delta * MOVEMENT_SPEED_PLAYER * BASE_SPEED_MULTIPLIER;
        if (step <= 0) {
            return false;
        }

        if (tryStep(defender, vector, step, (x, y) => this.blocking.isBlocked(x, y, defender))) {
            defender.isMoving = 1;
            return true;
        }

        const alternate = findAlternateVector(defender, vector, step, AVOIDANCE_ANGLES, (x, y) => this.blocking.isBlocked(x, y, defender));
        if (alternate && tryStep(defender, alternate, step, (x, y) => this.blocking.isBlocked(x, y, defender))) {
            defender.cachedVector = alternate;
            defender.direction = vectorToDirection(alternate.dx, alternate.dy, defender.direction);
            defender.isMoving = 1;
            return true;
        }

        defender.isMoving = 0;
        defender.cachedVector = null;
        defender.nextDecisionAt = Math.min(defender.nextDecisionAt || (now + 400), now + 400 + Math.random() * 200);
        return false;
    }

    resolveTargetPosition(target) {
        if (!target) {
            return null;
        }
        if (target.kind === 'bomb' && target.id) {
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

    pickApproachPoint(defender, target, mask) {
        const targetTileX = Math.floor(target.x / TILE_SIZE);
        const targetTileY = Math.floor(target.y / TILE_SIZE);
        const maxRadius = 12;
        let best = null;
        const neighborPenalty = (tx, ty) => {
            if (!mask || typeof mask.isBlockedTile !== 'function') {
                return 0;
            }
            let penalty = 0;
            for (let nx = -1; nx <= 1; nx += 1) {
                for (let ny = -1; ny <= 1; ny += 1) {
                    if (nx === 0 && ny === 0) {
                        continue;
                    }
                    if (mask.isBlockedTile(tx + nx, ty + ny)) {
                        penalty += 1;
                    }
                }
            }
            return penalty;
        };
        for (let radius = 0; radius <= maxRadius; radius += 1) {
            for (let dx = -radius; dx <= radius; dx += 1) {
                for (let dy = -radius; dy <= radius; dy += 1) {
                    const tileX = targetTileX + dx;
                    const tileY = targetTileY + dy;
                    if (mask && mask.isBlockedTile(tileX, tileY)) {
                        continue;
                    }
                    const px = tileX * TILE_SIZE + HALF_TILE;
                    const py = tileY * TILE_SIZE + HALF_TILE;
                    const distSq = distanceSquared(defender.offset.x + HALF_TILE, defender.offset.y + HALF_TILE, px, py);
                    // Prefer positions within shooting range
                    const inRange = distSq <= (SHOOT_RANGE * SHOOT_RANGE);
                    const adjPenalty = neighborPenalty(tileX, tileY);
                    // Higher penalty for being adjacent to blockers; still allowed if no alternatives
                    const score = distSq + (inRange ? 0 : SHOOT_RANGE * SHOOT_RANGE) + (adjPenalty * TILE_SIZE * TILE_SIZE);
                    if (!best || score < best.score) {
                        best = { x: px, y: py, score };
                    }
                }
            }
            if (best && best.score <= (SHOOT_RANGE * SHOOT_RANGE * 2)) {
                break; // good enough spot found
            }
        }
        return best || { x: target.x, y: target.y };
    }

    removeDefenderAtIndex(index) {
        const defender = this.defenders[index];
        if (defender) {
            const citySet = this.cityDefenders.get(defender.cityId);
            if (citySet) {
                citySet.delete(defender.id);
            }
        }
        this.defenders.splice(index, 1);
        this.game.forceDraw = true;
    }

    pruneDefendersOutsideCityLimit() {
        if (!this.defenders.length || !this.game?.player) {
            return;
        }
        const playerX = this.game.player.offset?.x || 0;
        const playerY = this.game.player.offset?.y || 0;
        const disengageSq = DISENGAGEMENT_RADIUS * DISENGAGEMENT_RADIUS;

        for (const [cityId, defendersForCity] of this.cityDefenders.entries()) {
            if (!defendersForCity || defendersForCity.size === 0) {
                this.cityDefenders.delete(cityId);
                continue;
            }
            const city = this.game.cities?.[cityId];
            if (!city) {
                this.removeDefendersForCity(cityId);
                continue;
            }
            const cityX = toFinite(city.x, 0) + (TILE_SIZE * 1.5);
            const cityY = toFinite(city.y, 0) + (TILE_SIZE * 1.5);
            const distSq = distanceSquared(playerX + HALF_TILE, playerY + HALF_TILE, cityX, cityY);
            if (distSq > disengageSq) {
                console.log(`[DefenderBot] Removing defenders for city ${cityId} (player disengaged)`);
                this.removeDefendersForCity(cityId);
            }
        }
    }

    removeDefendersForCity(cityId) {
        if (cityId === null || cityId === undefined) {
            return;
        }
        for (let i = this.defenders.length - 1; i >= 0; i -= 1) {
            if (this.defenders[i]?.cityId === cityId) {
                this.removeDefenderAtIndex(i);
            }
        }
        this.cityDefenders.delete(cityId);
        this.game.forceDraw = true;
    }

    bindSocketEvents() {
        const socketListener = this.game?.socketListener;
        if (!socketListener || typeof socketListener.on !== 'function' || this.socketEventsBound) {
            return;
        }
        socketListener.on('city:orbed', this.handleCityOrbed);
        this.socketEventsBound = true;
    }

    handleCityOrbed(data) {
        const cityId = toFinite(data?.targetCity ?? data?.city ?? data?.id, null);
        if (cityId === null) {
            return;
        }
        console.log(`[DefenderBot] Removing defenders for orbed city ${cityId}`);
        this.removeDefendersForCity(cityId);
    }

}

export default DefenderBotManager;
