import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import {
    headingToTarget,
    legacyHeadingToBulletHeading,
    moveBotByHeading,
    nearestHumanPlayer,
    normalizeBotHeading,
    resolveCityCenter
} from "./BotShared.js";
import { createBotPathContext, findBotPath, type BotPathContext } from "./BotPathingService.js";

const DEFENDER_TYPE: RuntimeBotController["botType"] = "defender";
const MAX_DEFENDERS_PER_CITY = 4;
const MAX_TOTAL_DEFENDERS = 16;
const SPAWN_CHECK_INTERVAL_MS = 3000;
const PATHFIND_INTERVAL_MS = 1000;
const PATH_SEARCH_RADIUS_TILES = 120;
const PATH_MAX_NODES = 8000;
const WAYPOINT_REACHED_DISTANCE_PX = 24;
const SHOOT_RANGE_TILES = 16;
const STANDOFF_FACTOR = 0.5;
const MIN_TARGET_BUFFER_TILES = 1;
const MUZZLE_OFFSET_PX = 30;
const BOT_HALF = 24;
const BOT_HEALTH = 20;
const ITEM_TYPE_BOMB = 3;
const DEFENDER_ROLES: Array<NonNullable<RuntimeBotController["botRole"]>> = [
    "mayor",
    "shooter",
    "bomb_defuser",
    "miner"
];

type BotTarget = {
    id?: string;
    x: number;
    y: number;
    standOffPx: number;
};

const countDefendersForCity = (state: RuntimeState, cityId: number): number => {
    let count = 0;
    for (const bot of state.botControllers.values()) {
        if (bot.botType === DEFENDER_TYPE && bot.homeCityId === cityId) {
            count += 1;
        }
    }
    return count;
};

const countTotalDefenders = (state: RuntimeState): number => {
    let count = 0;
    for (const bot of state.botControllers.values()) {
        if (bot.botType === DEFENDER_TYPE) {
            count += 1;
        }
    }
    return count;
};

const removeDefender = (state: RuntimeState, botId: string): void => {
    state.botControllers.delete(botId);
    state.players.delete(botId);
};

const removeDefendersForCity = (state: RuntimeState, cityId: number): boolean => {
    let removed = false;
    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.botType !== DEFENDER_TYPE || controller.homeCityId !== cityId) {
            continue;
        }
        removeDefender(state, botId);
        removed = true;
    }
    return removed;
};

const cityHasNearbyHuman = (
    state: RuntimeState,
    config: RuntimeConfig,
    cityId: number,
    engagementRadius: number
): boolean => {
    const center = resolveCityCenter(cityId, config);
    const radiusSq = engagementRadius * engagementRadius;
    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        const playerCenterX = player.x + BOT_HALF;
        const playerCenterY = player.y + BOT_HALF;
        const dx = center.x - playerCenterX;
        const dy = center.y - playerCenterY;
        const distanceSq = (dx * dx) + (dy * dy);
        if (distanceSq <= radiusSq) {
            return true;
        }
    }
    return false;
};

const createDefender = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    cityId: number,
    role: NonNullable<RuntimeBotController["botRole"]>
): RuntimePlayer => {
    state.seq += 1;
    const id = `defender_${cityId}_${state.seq}`;
    const center = resolveCityCenter(cityId, config);
    const angle = Math.random() * (Math.PI * 2);
    const spawnRadius = config.tileSize * 10;
    const spawnX = center.x + (Math.cos(angle) * spawnRadius) - BOT_HALF;
    const spawnY = center.y + (Math.sin(angle) * spawnRadius) - BOT_HALF;
    const safeSpawn = moveBotByHeading(state, config, spawnX, spawnY, 0, 0, 0);

    const player: RuntimePlayer = {
        id,
        city: cityId,
        x: safeSpawn.x,
        y: safeSpawn.y,
        direction: Math.floor(Math.random() * 32),
        speed: config.botMoveSpeed,
        health: BOT_HEALTH,
        maxHealth: BOT_HEALTH,
        isBot: true,
        botType: DEFENDER_TYPE
    };
    state.players.set(id, player);
    state.botControllers.set(id, {
        id,
        botType: DEFENDER_TYPE,
        botRole: role,
        homeCityId: cityId,
        targetCityId: cityId,
        pathIndex: 0,
        nextPathAt: now,
        nextRetargetAt: now,
        nextShotAt: now + config.botShootIntervalMs
    });
    return player;
};

const evaluateDefenderPopulation = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number
): boolean => {
    if (now < state.defenderSpawnCheckAt) {
        return false;
    }
    state.defenderSpawnCheckAt = now + SPAWN_CHECK_INTERVAL_MS;

    let dirty = false;
    const engagementRadius = Math.max(config.botDetectionRadius, config.tileSize * 40);
    const maxPerCity = Math.max(0, Math.min(MAX_DEFENDERS_PER_CITY, config.fakeCityDefendersPerCity));

    for (const fakeCity of state.fakeCities.values()) {
        if (!fakeCity.active) {
            dirty = removeDefendersForCity(state, fakeCity.cityId) || dirty;
            continue;
        }

        if (!cityHasNearbyHuman(state, config, fakeCity.cityId, engagementRadius)) {
            dirty = removeDefendersForCity(state, fakeCity.cityId) || dirty;
            continue;
        }

        const cityDefenderCount = countDefendersForCity(state, fakeCity.cityId);
        if (cityDefenderCount >= maxPerCity || countTotalDefenders(state) >= MAX_TOTAL_DEFENDERS) {
            continue;
        }

        let canSpawn = Math.min(maxPerCity - cityDefenderCount, MAX_TOTAL_DEFENDERS - countTotalDefenders(state));
        while (canSpawn > 0) {
            const role = DEFENDER_ROLES[countDefendersForCity(state, fakeCity.cityId) % DEFENDER_ROLES.length] ?? "shooter";
            createDefender(state, config, now, fakeCity.cityId, role);
            canSpawn -= 1;
            dirty = true;
        }
    }

    return dirty;
};

const fireAtTarget = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    bot: RuntimePlayer,
    controller: RuntimeBotController,
    target: { x: number; y: number },
    now: number
): void => {
    if (now < controller.nextShotAt) {
        return;
    }

    const botCenterX = bot.x + BOT_HALF;
    const botCenterY = bot.y + BOT_HALF;
    const targetCenterX = target.x + BOT_HALF;
    const targetCenterY = target.y + BOT_HALF;
    const dx = targetCenterX - botCenterX;
    const dy = targetCenterY - botCenterY;
    const rangeSq = (dx * dx) + (dy * dy);
    const maxRange = config.tileSize * SHOOT_RANGE_TILES;
    if (rangeSq > (maxRange * maxRange)) {
        return;
    }

    const direction = headingToTarget(botCenterX, botCenterY, targetCenterX, targetCenterY, bot.direction);
    const bulletDirection = legacyHeadingToBulletHeading(direction);
    const radians = (-normalizeBotHeading(direction) / 16) * Math.PI;
    const muzzleX = botCenterX + (Math.sin(radians) * -MUZZLE_OFFSET_PX);
    const muzzleY = botCenterY + (Math.cos(radians) * -MUZZLE_OFFSET_PX);

    controller.nextShotAt = now + config.botShootIntervalMs;
    state.seq += 1;
    const bulletId = `bullet_${state.seq}`;
    state.bullets.set(bulletId, {
        id: bulletId,
        ownerId: bot.id,
        city: bot.city,
        x: muzzleX,
        y: muzzleY,
        direction: bulletDirection,
        speed: config.bulletSpeed,
        type: 0
    });
    emitter.emit("bullet.fired", {
        id: bulletId,
        ownerId: bot.id,
        city: bot.city,
        position: { x: muzzleX, y: muzzleY },
        direction: bulletDirection,
        type: 0
    });
};

const maybeAdvanceWaypoint = (controller: RuntimeBotController, bot: RuntimePlayer): void => {
    const path = controller.path;
    if (!path || path.length === 0) {
        controller.pathIndex = 0;
        return;
    }

    const index = controller.pathIndex ?? 0;
    const waypoint = path[index];
    if (!waypoint) {
        controller.pathIndex = path.length;
        return;
    }

    const dx = waypoint.x - bot.x;
    const dy = waypoint.y - bot.y;
    if ((dx * dx) + (dy * dy) > (WAYPOINT_REACHED_DISTANCE_PX * WAYPOINT_REACHED_DISTANCE_PX)) {
        return;
    }

    controller.pathIndex = index + 1;
};

const maybeRebuildPath = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    controller: RuntimeBotController,
    bot: RuntimePlayer,
    target: { id?: string; x: number; y: number },
    fallbackTarget?: { x: number; y: number },
    pathContext?: BotPathContext
): void => {
    const targetChanged = (target.id ?? "") !== (controller.targetPlayerId ?? "");
    if (!targetChanged && now < (controller.nextPathAt ?? 0)) {
        return;
    }

    let path = findBotPath(state, config, bot.x, bot.y, target.x, target.y, {
        searchRadiusTiles: PATH_SEARCH_RADIUS_TILES,
        maxNodes: PATH_MAX_NODES,
        context: pathContext
    });
    if (!path && fallbackTarget) {
        path = findBotPath(state, config, bot.x, bot.y, fallbackTarget.x, fallbackTarget.y, {
            searchRadiusTiles: PATH_SEARCH_RADIUS_TILES,
            maxNodes: PATH_MAX_NODES,
            context: pathContext
        });
    }

    if (path) {
        controller.path = path;
    } else {
        delete controller.path;
    }
    controller.pathIndex = 0;
    controller.nextPathAt = now + PATHFIND_INTERVAL_MS;
    if (target.id) {
        controller.targetPlayerId = target.id;
    } else {
        delete controller.targetPlayerId;
    }
};

const nearestBombTarget = (
    state: RuntimeState,
    config: RuntimeConfig,
    bot: RuntimePlayer,
    maxDistance: number
): BotTarget | null => {
    let nearest: BotTarget | null = null;
    let nearestDistanceSq = maxDistance * maxDistance;
    const botCenterX = bot.x + BOT_HALF;
    const botCenterY = bot.y + BOT_HALF;

    for (const hazard of state.hazards.values()) {
        if (hazard.type !== ITEM_TYPE_BOMB || !hazard.active || !hazard.armed) {
            continue;
        }
        if (hazard.cityId === bot.city) {
            continue;
        }

        const targetX = hazard.x;
        const targetY = hazard.y;
        const dx = (targetX + BOT_HALF) - botCenterX;
        const dy = (targetY + BOT_HALF) - botCenterY;
        const distanceSq = (dx * dx) + (dy * dy);
        if (distanceSq >= nearestDistanceSq) {
            continue;
        }
        nearestDistanceSq = distanceSq;
        nearest = {
            id: hazard.id,
            x: targetX,
            y: targetY,
            standOffPx: (config.tileSize * SHOOT_RANGE_TILES) * 0.6
        };
    }

    return nearest;
};

const pickTarget = (
    state: RuntimeState,
    config: RuntimeConfig,
    bot: RuntimePlayer,
    controller: RuntimeBotController,
    detectionRadius: number
): BotTarget | null => {
    const nearestPlayer = nearestHumanPlayer(state, bot.x, bot.y, detectionRadius);
    const bombTarget = nearestBombTarget(state, config, bot, detectionRadius);

    if (controller.botRole === "bomb_defuser" && bombTarget) {
        return bombTarget;
    }
    if (nearestPlayer) {
        return {
            id: nearestPlayer.id,
            x: nearestPlayer.x,
            y: nearestPlayer.y,
            standOffPx: (config.tileSize * SHOOT_RANGE_TILES) * STANDOFF_FACTOR
        };
    }
    if (bombTarget) {
        return bombTarget;
    }
    return null;
};

const computeStandOffTarget = (
    config: RuntimeConfig,
    bot: RuntimePlayer,
    target: BotTarget
): { x: number; y: number } => {
    const botCenterX = bot.x + BOT_HALF;
    const botCenterY = bot.y + BOT_HALF;
    const targetCenterX = target.x + BOT_HALF;
    const targetCenterY = target.y + BOT_HALF;
    const dx = targetCenterX - botCenterX;
    const dy = targetCenterY - botCenterY;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance < 1e-3) {
        return { x: target.x, y: target.y };
    }

    const shootRangePx = config.tileSize * SHOOT_RANGE_TILES;
    const desiredStandOffPx = target.standOffPx;
    const minBufferPx = config.tileSize * MIN_TARGET_BUFFER_TILES;
    const keepBackPx = Math.max(minBufferPx, Math.min(shootRangePx * 0.95, desiredStandOffPx));
    const ratio = Math.max(0, (distance - keepBackPx) / distance);
    const goalCenterX = botCenterX + (dx * ratio);
    const goalCenterY = botCenterY + (dy * ratio);

    return {
        x: goalCenterX - BOT_HALF,
        y: goalCenterY - BOT_HALF
    };
};

const resolveMovementTarget = (
    controller: RuntimeBotController,
    fallback: { x: number; y: number }
): { x: number; y: number } => {
    const path = controller.path;
    const index = controller.pathIndex ?? 0;
    if (!path || index >= path.length) {
        return fallback;
    }
    return path[index] ?? fallback;
};

export const tickDefenderBots = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number
): boolean => {
    let dirty = evaluateDefenderPopulation(state, config, now);
    const detectionRadius = Math.max(config.botDetectionRadius, config.tileSize * 22);
    const pathContext = createBotPathContext();

    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.botType !== DEFENDER_TYPE) {
            continue;
        }

        const bot = state.players.get(botId);
        if (!bot || !bot.isBot || bot.health <= 0) {
            removeDefender(state, botId);
            dirty = true;
            continue;
        }

        const fakeCity = state.fakeCities.get(controller.homeCityId);
        if (!fakeCity?.active) {
            removeDefender(state, botId);
            dirty = true;
            continue;
        }

        const fallbackCenter = resolveCityCenter(controller.homeCityId, config);
        const fallback = {
            x: fallbackCenter.x - BOT_HALF,
            y: fallbackCenter.y - BOT_HALF
        };

        const attackTarget = pickTarget(state, config, bot, controller, detectionRadius);
        const movementTargetFallback = attackTarget
            ? (
                attackTarget.id
                    ? { id: attackTarget.id, ...computeStandOffTarget(config, bot, attackTarget) }
                    : computeStandOffTarget(config, bot, attackTarget)
            )
            : fallback;

        maybeRebuildPath(
            state,
            config,
            now,
            controller,
            bot,
            movementTargetFallback,
            attackTarget ? { x: attackTarget.x, y: attackTarget.y } : undefined,
            pathContext
        );
        maybeAdvanceWaypoint(controller, bot);
        const movementTarget = resolveMovementTarget(controller, movementTargetFallback);

        const direction = headingToTarget(
            bot.x + BOT_HALF,
            bot.y + BOT_HALF,
            movementTarget.x + BOT_HALF,
            movementTarget.y + BOT_HALF,
            bot.direction
        );

        const moved = moveBotByHeading(
            state,
            config,
            bot.x,
            bot.y,
            direction,
            config.botMoveSpeed,
            deltaMs
        );

        const updatedBot: RuntimePlayer = {
            ...bot,
            direction,
            x: moved.x,
            y: moved.y
        };
        state.players.set(botId, updatedBot);
        if (attackTarget) {
            fireAtTarget(state, emitter, config, updatedBot, controller, attackTarget, now);
        }
        dirty = true;
    }

    return dirty;
};
