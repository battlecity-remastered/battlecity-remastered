import { advancePlayer } from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { resolveSpawnPosition } from "../spawn/SpawnService.js";
import { headingToTarget, nearestHumanPlayer, resolveCityCenter } from "./BotShared.js";

const ROGUE_TYPE: RuntimeBotController["botType"] = "rogue";

const countRogues = (state: RuntimeState): number => {
    let total = 0;
    for (const bot of state.botControllers.values()) {
        if (bot.botType === ROGUE_TYPE) {
            total += 1;
        }
    }
    return total;
};

const countBuildings = (state: RuntimeState, cityId: number): number => {
    let total = 0;
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId) {
            total += 1;
        }
    }
    return total;
};

const chooseRogueTargetCity = (state: RuntimeState, config: RuntimeConfig): number | null => {
    let selected: number | null = null;
    let bestScore = -1;
    for (const city of state.cities.values()) {
        if (state.fakeCities.get(city.cityId)?.active) {
            continue;
        }
        if (countBuildings(state, city.cityId) < config.rogueBuildingThreshold) {
            continue;
        }
        if (city.score > bestScore) {
            selected = city.cityId;
            bestScore = city.score;
        }
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
    const position = resolveSpawnPosition(
        state,
        targetCityId,
        center.x + (config.tileSize * 10),
        center.y,
        config
    );
    state.players.set(id, {
        id,
        city: -1,
        x: position.x,
        y: position.y,
        direction: 16,
        speed: config.botMoveSpeed * 0.85,
        health: 100,
        maxHealth: 100,
        isBot: true,
        botType: ROGUE_TYPE
    });
    state.botControllers.set(id, {
        id,
        botType: ROGUE_TYPE,
        homeCityId: -1,
        targetCityId,
        nextRetargetAt: now + 1500,
        nextShotAt: now + config.botShootIntervalMs
    });
};

const ensureRoguePopulation = (state: RuntimeState, config: RuntimeConfig, now: number): boolean => {
    if (countRogues(state) >= config.rogueMaxBots) {
        return false;
    }
    const targetCityId = chooseRogueTargetCity(state, config);
    if (targetCityId === null) {
        return false;
    }
    spawnRogue(state, config, now, targetCityId);
    return true;
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
        const targetCenter = resolveCityCenter(controller.targetCityId, config);
        const nearest = nearestHumanPlayer(state, bot.x, bot.y, config.botDetectionRadius, controller.targetCityId);
        const target = nearest ?? targetCenter;
        const direction = headingToTarget(bot.x, bot.y, target.x, target.y, bot.direction);
        const moved = advancePlayer(
            {
                ...bot,
                direction
            },
            deltaMs,
            config.mapMax,
            config.mapMax
        );
        state.players.set(botId, {
            ...bot,
            direction,
            x: moved.x,
            y: moved.y
        });
        if (now >= controller.nextShotAt && nearest) {
            controller.nextShotAt = now + config.botShootIntervalMs;
            state.seq += 1;
            const bulletId = `bullet_${state.seq}`;
            state.bullets.set(bulletId, {
                id: bulletId,
                ownerId: botId,
                city: -1,
                x: moved.x,
                y: moved.y,
                direction,
                speed: config.bulletSpeed,
                type: 0
            });
            emitter.emit("bullet.fired", {
                id: bulletId,
                ownerId: botId,
                city: -1,
                position: { x: moved.x, y: moved.y },
                direction,
                type: 0
            });
        }
        dirty = true;
    }
    return dirty;
};
