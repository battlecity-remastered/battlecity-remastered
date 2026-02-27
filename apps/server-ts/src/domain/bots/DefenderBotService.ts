import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import {
    botFireAtTarget,
    moveBotByHeading,
    resolveCityCenter,
    stepBotAlongPath
} from "./BotShared.js";
import { createBotPathContext } from "./BotPathingService.js";
import { pickDefenderTarget, resolveDefenderMovementFallback } from "./DefenderBotTargetingService.js";

const DEFENDER_TYPE: RuntimeBotController["botType"] = "defender";
const MAX_DEFENDERS_PER_CITY = 4;
const MAX_TOTAL_DEFENDERS = 16;
const SPAWN_CHECK_INTERVAL_MS = 3000;
const PATHFIND_INTERVAL_MS = 1000;
const PATH_SEARCH_RADIUS_TILES = 120;
const PATH_MAX_NODES = 8000;
const WAYPOINT_REACHED_DISTANCE_PX = 24;
const SHOOT_RANGE_TILES = 16;
const MUZZLE_OFFSET_PX = 30;
const BOT_HALF = 24;
const BOT_HEALTH = 20;
const DEFENDER_ROLES: Array<NonNullable<RuntimeBotController["botRole"]>> = [
    "mayor",
    "shooter",
    "bomb_defuser",
    "miner"
];

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

const tickDefenderController = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number,
    detectionRadius: number,
    botId: string,
    controller: RuntimeBotController,
    pathContext: ReturnType<typeof createBotPathContext>
): boolean => {
    const bot = state.players.get(botId);
    if (!bot || !bot.isBot || bot.health <= 0) {
        removeDefender(state, botId);
        return true;
    }

    const fakeCity = state.fakeCities.get(controller.homeCityId);
    if (!fakeCity?.active) {
        removeDefender(state, botId);
        return true;
    }

    const fallbackCenter = resolveCityCenter(controller.homeCityId, config);
    const fallback = {
        x: fallbackCenter.x - BOT_HALF,
        y: fallbackCenter.y - BOT_HALF
    };
    const attackTarget = pickDefenderTarget(state, config, bot, controller, detectionRadius);
    const movementTargetFallback = resolveDefenderMovementFallback(config, bot, attackTarget) ?? fallback;
    const fallbackPathTarget = attackTarget ? { x: attackTarget.x, y: attackTarget.y } : undefined;
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
            moveSpeed: config.botMoveSpeed
        }
    );
    if (attackTarget) {
        botFireAtTarget(state, emitter, config, updatedBot, controller, attackTarget, now, {
            shootRangeTiles: SHOOT_RANGE_TILES,
            muzzleOffsetPx: MUZZLE_OFFSET_PX,
            shootIntervalMs: config.botShootIntervalMs,
            bulletCity: bot.city
        });
    }
    return true;
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

        dirty = tickDefenderController(
            state,
            config,
            emitter,
            now,
            deltaMs,
            detectionRadius,
            botId,
            controller,
            pathContext
        ) || dirty;
    }

    return dirty;
};
