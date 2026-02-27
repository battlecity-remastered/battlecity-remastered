import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import {
    botFireAtTarget,
    computeBotStandOffTarget,
    isBotTopLeftPositionValid,
    nearestHumanPlayer,
    resolveCityCenter,
    stepBotAlongPath
} from "./BotShared.js";
import { createBotPathContext } from "./BotPathingService.js";
import { chooseRogueTargetCity } from "./RogueBotTargetingService.js";

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
const SPAWN_MIN_RADIUS_TILES = 24;
const SPAWN_MAX_RADIUS_TILES = 40;
const SPAWN_ANGLE_SAMPLES = 64;
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

const resolveRogueSpawn = (
    state: RuntimeState,
    config: RuntimeConfig,
    targetCityId: number
): { x: number; y: number } | null => {
    const center = resolveCityCenter(targetCityId, config);
    const minRadius = config.tileSize * SPAWN_MIN_RADIUS_TILES;
    const maxRadius = Math.max(minRadius + config.tileSize, config.tileSize * SPAWN_MAX_RADIUS_TILES);
    const minDistanceSq = minRadius * minRadius;
    const baseAngle = Math.random() * (Math.PI * 2);
    const minTopLeft = 0;
    const maxTopLeft = config.mapMax - (BOT_HALF * 2);
    const midRadius = (minRadius + maxRadius) * 0.5;
    const radiusCandidates = [maxRadius, midRadius, minRadius];

    for (let step = 0; step < SPAWN_ANGLE_SAMPLES; step += 1) {
        const angle = baseAngle + ((Math.PI * 2 * step) / SPAWN_ANGLE_SAMPLES);
        for (const radius of radiusCandidates) {
            const spawn = resolveRogueSpawnCandidate(
                state,
                config,
                center,
                angle,
                radius,
                minTopLeft,
                maxTopLeft,
                minDistanceSq
            );
            if (spawn) {
                return spawn;
            }
        }
    }

    return null;
};

const resolveRogueSpawnCandidate = (
    state: RuntimeState,
    config: RuntimeConfig,
    center: { x: number; y: number },
    angle: number,
    radius: number,
    minTopLeft: number,
    maxTopLeft: number,
    minDistanceSq: number
): { x: number; y: number } | null => {
    const candidateX = center.x + (Math.cos(angle) * radius) - BOT_HALF;
    const candidateY = center.y + (Math.sin(angle) * radius) - BOT_HALF;
    if (candidateX < minTopLeft || candidateY < minTopLeft || candidateX > maxTopLeft || candidateY > maxTopLeft) {
        return null;
    }
    if (!isBotTopLeftPositionValid(state, config, candidateX, candidateY)) {
        return null;
    }

    const safeCenterX = candidateX + BOT_HALF;
    const safeCenterY = candidateY + BOT_HALF;
    const dx = safeCenterX - center.x;
    const dy = safeCenterY - center.y;
    if ((dx * dx) + (dy * dy) < minDistanceSq) {
        return null;
    }
    return { x: candidateX, y: candidateY };
};

const resolveRogueMovementFallback = (
    config: RuntimeConfig,
    bot: RuntimePlayer,
    nearest: { id: string; x: number; y: number } | null,
    fallbackTarget: { x: number; y: number }
): { id?: string; x: number; y: number } => {
    if (!nearest) {
        return fallbackTarget;
    }
    return computeBotStandOffTarget(config, bot, nearest, {
        shootRangeTiles: SHOOT_RANGE_TILES,
        standoffFactor: STANDOFF_FACTOR,
        minTargetBufferTiles: MIN_TARGET_BUFFER_TILES
    });
};

const tickRogueController = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number,
    botId: string,
    controller: RuntimeBotController,
    pathContext: ReturnType<typeof createBotPathContext>
): boolean => {
    const bot = state.players.get(botId);
    if (!bot || !bot.isBot || bot.health <= 0 || state.fakeCities.get(controller.targetCityId)?.active) {
        state.botControllers.delete(botId);
        state.players.delete(botId);
        return true;
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
    const movementTargetFallback = resolveRogueMovementFallback(config, bot, nearest, attackTarget);
    const fallbackPathTarget = nearest ? { x: nearest.x, y: nearest.y } : undefined;
    const updatedBot = stepBotAlongPath(
        state,
        config,
        now,
        deltaMs,
        controller,
        bot,
        movementTargetFallback,
        {
            fallbackPathTarget,
            searchRadiusTiles: PATH_SEARCH_RADIUS_TILES,
            maxNodes: PATH_MAX_NODES,
            pathfindIntervalMs: PATHFIND_INTERVAL_MS,
            pathContext,
            waypointReachedDistancePx: WAYPOINT_REACHED_DISTANCE_PX,
            moveSpeed: config.botMoveSpeed * MOVE_SPEED_MULTIPLIER
        }
    );
    botFireAtTarget(state, emitter, config, updatedBot, controller, attackTarget, now, {
        shootRangeTiles: SHOOT_RANGE_TILES,
        muzzleOffsetPx: MUZZLE_OFFSET_PX,
        shootIntervalMs: Math.max(SHOOT_INTERVAL_MS, config.botShootIntervalMs),
        bulletCity: -1
    });
    return true;
};

const spawnRogue = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    targetCityId: number
): boolean => {
    const spawn = resolveRogueSpawn(state, config, targetCityId);
    if (!spawn) {
        return false;
    }
    state.seq += 1;
    const id = `rogue_${targetCityId}_${state.seq}`;
    const player: RuntimePlayer = {
        id,
        city: -1,
        x: spawn.x,
        y: spawn.y,
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
    return true;
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

    const targetCityId = chooseRogueTargetCity(state, config);
    if (targetCityId === null) {
        return false;
    }

    return spawnRogue(state, config, now, targetCityId);
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
        dirty = tickRogueController(state, config, emitter, now, deltaMs, botId, controller, pathContext) || dirty;
    }

    return dirty;
};
