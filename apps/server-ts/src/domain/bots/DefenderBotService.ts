import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import {
    botFireAtTarget,
    hasBotTerrainSight,
    isBotTopLeftPositionValid,
    resolveCityCenter,
    stepBotAlongPath
} from "./BotShared.js";
import { createBotPathContext, findBotPath } from "./BotPathingService.js";
import { pickDefenderTarget, resolveDefenderMovementFallback } from "./DefenderBotTargetingService.js";

import { defenderPatrolGoal, maybeLayMinerTrap } from "./DefenderBotActivities.js";

const DEFENDER_TYPE: RuntimeBotController["botType"] = "defender";
const MAX_DEFENDERS_PER_CITY = 4;
const MAX_TOTAL_DEFENDERS = 16;
const SPAWN_CHECK_INTERVAL_MS = 3000;
const PATHFIND_INTERVAL_MS = 1000;
const PATH_SEARCH_RADIUS_TILES = 32;
const PATH_MAX_NODES = 8000;
const WAYPOINT_REACHED_DISTANCE_PX = 2;
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
): RuntimePlayer | undefined => {
    state.seq += 1;
    const id = `defender_${cityId}_${state.seq}`;
    const center = resolveCityCenter(cityId, config);
    const angle = Math.random() * (Math.PI * 2);
    let safeSpawn: {x: number; y: number} | undefined;
    const pathContext = createBotPathContext();
    for (let sample = 0; sample < 32 && !safeSpawn; sample++) {
        const heading = angle + sample * Math.PI / 16;
        const spawnRadius = config.tileSize * (sample % 2 ? 8 : 10);
        const candidate = {
            x: Math.floor((center.x + Math.cos(heading)*spawnRadius - BOT_HALF)/config.tileSize)*config.tileSize,
            y: Math.floor((center.y + Math.sin(heading)*spawnRadius - BOT_HALF)/config.tileSize)*config.tileSize
        };
        if (candidate.x<0 || candidate.y<0 || candidate.x+48>config.mapMax || candidate.y+48>config.mapMax) continue;
        if (!isBotTopLeftPositionValid(state, config, candidate.x, candidate.y)) continue;
        if ([...state.players.values()].some(player => Math.hypot(player.x-candidate.x,player.y-candidate.y)<config.tileSize*2)) continue;
        if (!findBotPath(state, config, candidate.x, candidate.y, center.x-24, center.y+config.tileSize,
            {searchRadiusTiles:32, maxNodes:8000, context:pathContext})) continue;
        safeSpawn = candidate;
    }
    if (!safeSpawn) return undefined;

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
    const city = state.fakeCities.get(cityId);
    if (city) { city.defenderRoster ??= {}; city.defenderRoster[role] = {id, respawnAt: 0}; }
    state.botControllers.set(id, {
        id,
        botType: DEFENDER_TYPE,
        botRole: role,
        homeCityId: cityId,
        targetCityId: cityId,
        pathIndex: 0,
        nextPathAt: now,
        nextRetargetAt: now,
        nextHazardAt: now + 6000,
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
            delete fakeCity.defenderRoster;
            continue;
        }

        if (!cityHasNearbyHuman(state, config, fakeCity.cityId, engagementRadius)) {
            dirty = removeDefendersForCity(state, fakeCity.cityId) || dirty;
            delete fakeCity.defenderRoster;
            continue;
        }

        const cityDefenderCount = countDefendersForCity(state, fakeCity.cityId);
        if (cityDefenderCount >= maxPerCity || countTotalDefenders(state) >= MAX_TOTAL_DEFENDERS) {
            continue;
        }

        for (const role of DEFENDER_ROLES.slice(0, maxPerCity)) {
            if (countTotalDefenders(state) >= MAX_TOTAL_DEFENDERS) break;
            const slot = fakeCity.defenderRoster?.[role];
            if (slot && state.players.has(slot.id) && state.botControllers.has(slot.id)) continue;
            if (slot && slot.respawnAt === 0) { slot.respawnAt = now + 20_000; continue; }
            if (slot && now < slot.respawnAt) continue;
            dirty = !!createDefender(state, config, now, fakeCity.cityId, role) || dirty;
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

    if ((bot.frozenUntil ?? 0) > now) return false;
    const fallback = defenderPatrolGoal(state, config, bot, controller, now);
    const attackTarget = pickDefenderTarget(state, config, bot, controller, detectionRadius, now);
    const clearShot = !attackTarget || hasBotTerrainSight(state, config, bot, attackTarget);
    const movementTargetFallback = attackTarget && !clearShot
        ? attackTarget : (resolveDefenderMovementFallback(config, bot, attackTarget) ?? fallback);
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
    maybeLayMinerTrap(state, config, emitter, updatedBot, controller, attackTarget?.id, now);
    if (attackTarget && hasBotTerrainSight(state, config, updatedBot, attackTarget) && (updatedBot.frozenUntil ?? 0) <= now) {
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
