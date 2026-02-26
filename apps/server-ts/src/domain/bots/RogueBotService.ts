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

const ROGUE_TYPE: RuntimeBotController["botType"] = "rogue";
const SPAWN_INTERVAL_MS = 5000;
const PATHFIND_INTERVAL_MS = 1200;
const PATH_SEARCH_RADIUS_TILES = 120;
const PATH_MAX_NODES = 8000;
const WAYPOINT_REACHED_DISTANCE_PX = 24;
const SHOOT_INTERVAL_MS = 1400;
const SHOOT_RANGE_TILES = 12;
const STANDOFF_FACTOR = 0.5;
const MIN_TARGET_BUFFER_TILES = 1;
const SPAWN_RADIUS_TILES = 18;
const MOVE_SPEED_MULTIPLIER = 0.85;
const BOT_HALF = 24;
const MUZZLE_OFFSET_PX = 30;
const BOT_HEALTH = 20;

const countRogues = (state: RuntimeState): number => {
    let total = 0;
    for (const controller of state.botControllers.values()) {
        if (controller.botType === ROGUE_TYPE) {
            total += 1;
        }
    }
    return total;
};

const countBuildingsForCity = (state: RuntimeState, cityId: number): number => {
    let total = 0;
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId) {
            total += 1;
        }
    }
    return total;
};

const chooseTargetCity = (state: RuntimeState, config: RuntimeConfig): number | null => {
    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        if (state.fakeCities.get(player.city)?.active) {
            continue;
        }
        if (countBuildingsForCity(state, player.city) >= config.rogueBuildingThreshold) {
            return player.city;
        }
    }

    let selected: number | null = null;
    let bestScore = -1;
    for (const city of state.cities.values()) {
        if (state.fakeCities.get(city.cityId)?.active) {
            continue;
        }
        if (countBuildingsForCity(state, city.cityId) < config.rogueBuildingThreshold) {
            continue;
        }
        if (city.score <= bestScore) {
            continue;
        }
        selected = city.cityId;
        bestScore = city.score;
    }

    return selected;
};

const spawnRogue = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    targetCityId: number
): void => {
    state.seq += 1;
    const id = `rogue_${targetCityId}_${state.seq}`;
    const center = resolveCityCenter(targetCityId, config);
    const angle = Math.random() * (Math.PI * 2);
    const radius = config.tileSize * SPAWN_RADIUS_TILES;
    const spawnX = center.x + (Math.cos(angle) * radius) - BOT_HALF;
    const spawnY = center.y + (Math.sin(angle) * radius) - BOT_HALF;
    const safeSpawn = moveBotByHeading(state, config, spawnX, spawnY, 0, 0, 0);

    const player: RuntimePlayer = {
        id,
        city: -1,
        x: safeSpawn.x,
        y: safeSpawn.y,
        direction: Math.floor(Math.random() * 32),
        speed: config.botMoveSpeed * MOVE_SPEED_MULTIPLIER,
        health: BOT_HEALTH,
        maxHealth: BOT_HEALTH,
        isBot: true,
        botType: ROGUE_TYPE
    };
    state.players.set(id, player);
    state.botControllers.set(id, {
        id,
        botType: ROGUE_TYPE,
        homeCityId: -1,
        targetCityId,
        pathIndex: 0,
        nextPathAt: now,
        nextRetargetAt: now + 1200,
        nextShotAt: now + 900
    });
};

const ensureRoguePopulation = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number
): boolean => {
    if (now < state.rogueSpawnCheckAt) {
        return false;
    }
    state.rogueSpawnCheckAt = now + SPAWN_INTERVAL_MS;

    if (countRogues(state) >= config.rogueMaxBots) {
        return false;
    }

    const targetCityId = chooseTargetCity(state, config);
    if (targetCityId === null) {
        return false;
    }

    spawnRogue(state, config, now, targetCityId);
    return true;
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

    controller.nextShotAt = now + Math.max(SHOOT_INTERVAL_MS, config.botShootIntervalMs);
    state.seq += 1;
    const bulletId = `bullet_${state.seq}`;
    state.bullets.set(bulletId, {
        id: bulletId,
        ownerId: bot.id,
        city: -1,
        x: muzzleX,
        y: muzzleY,
        direction: bulletDirection,
        speed: config.bulletSpeed,
        type: 0
    });
    emitter.emit("bullet.fired", {
        id: bulletId,
        ownerId: bot.id,
        city: -1,
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

const computeStandOffTarget = (
    config: RuntimeConfig,
    bot: RuntimePlayer,
    target: { x: number; y: number }
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
    const desiredStandOffPx = shootRangePx * STANDOFF_FACTOR;
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

export const tickRogueBots = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number
): boolean => {
    let dirty = ensureRoguePopulation(state, config, now);
    const pathContext = createBotPathContext();

    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.botType !== ROGUE_TYPE) {
            continue;
        }

        const bot = state.players.get(botId);
        if (!bot || !bot.isBot || bot.health <= 0) {
            state.botControllers.delete(botId);
            state.players.delete(botId);
            dirty = true;
            continue;
        }

        if (state.fakeCities.get(controller.targetCityId)?.active) {
            state.botControllers.delete(botId);
            state.players.delete(botId);
            dirty = true;
            continue;
        }

        const targetCenter = resolveCityCenter(controller.targetCityId, config);
        const fallbackTarget = {
            x: targetCenter.x - BOT_HALF,
            y: targetCenter.y - BOT_HALF
        };

        const nearest = nearestHumanPlayer(
            state,
            bot.x,
            bot.y,
            Math.max(config.botDetectionRadius, config.tileSize * 18),
            controller.targetCityId
        );

        const attackTarget = nearest
            ? { id: nearest.id, x: nearest.x, y: nearest.y }
            : { x: fallbackTarget.x, y: fallbackTarget.y };
        const movementTargetFallback = nearest
            ? computeStandOffTarget(config, bot, attackTarget)
            : attackTarget;

        maybeRebuildPath(
            state,
            config,
            now,
            controller,
            bot,
            movementTargetFallback,
            nearest ? { x: nearest.x, y: nearest.y } : undefined,
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
            config.botMoveSpeed * MOVE_SPEED_MULTIPLIER,
            deltaMs
        );

        const updatedBot: RuntimePlayer = {
            ...bot,
            direction,
            x: moved.x,
            y: moved.y
        };
        state.players.set(botId, updatedBot);

        fireAtTarget(state, emitter, config, updatedBot, controller, attackTarget, now);
        dirty = true;
    }

    return dirty;
};
