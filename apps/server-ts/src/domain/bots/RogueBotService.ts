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

const ROGUE_TYPE: RuntimeBotController["botType"] = "rogue";
const SPAWN_INTERVAL_MS = 5000;
const SHOOT_INTERVAL_MS = 1400;
const SHOOT_RANGE_TILES = 12;
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

export const tickRogueBots = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number
): boolean => {
    let dirty = ensureRoguePopulation(state, config, now);

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
        const movementTarget = nearest ?? fallbackTarget;

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

        fireAtTarget(state, emitter, config, updatedBot, controller, nearest ?? fallbackTarget, now);
        dirty = true;
    }

    return dirty;
};
