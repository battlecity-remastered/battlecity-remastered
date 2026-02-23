import { advancePlayer } from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import { resolveSpawnPosition } from "../spawn/SpawnService.js";
import { headingToTarget, nearestHumanPlayer, resolveCityCenter } from "./BotShared.js";

const DEFENDER_TYPE: RuntimeBotController["botType"] = "defender";

const countDefendersForCity = (state: RuntimeState, cityId: number): number => {
    let count = 0;
    for (const bot of state.botControllers.values()) {
        if (bot.botType === DEFENDER_TYPE && bot.homeCityId === cityId) {
            count += 1;
        }
    }
    return count;
};

const createDefender = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    cityId: number
): RuntimePlayer => {
    state.seq += 1;
    const id = `defender_${cityId}_${state.seq}`;
    const center = resolveCityCenter(cityId, config);
    const angle = (state.seq % 16) * (Math.PI / 8);
    const radius = config.tileSize * 4;
    const position = resolveSpawnPosition(
        state,
        cityId,
        center.x + (Math.cos(angle) * radius),
        center.y + (Math.sin(angle) * radius),
        config
    );
    const player: RuntimePlayer = {
        id,
        city: cityId,
        x: position.x,
        y: position.y,
        direction: 0,
        speed: config.botMoveSpeed,
        health: 100,
        maxHealth: 100,
        isBot: true,
        botType: DEFENDER_TYPE
    };
    state.players.set(id, player);
    state.botControllers.set(id, {
        id,
        botType: DEFENDER_TYPE,
        homeCityId: cityId,
        targetCityId: cityId,
        nextRetargetAt: now,
        nextShotAt: now + config.botShootIntervalMs
    });
    return player;
};

const spawnDefendersForActiveCities = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number
): boolean => {
    let dirty = false;
    for (const fakeCity of state.fakeCities.values()) {
        if (!fakeCity.active) {
            continue;
        }
        const present = countDefendersForCity(state, fakeCity.cityId);
        for (let index = present; index < config.fakeCityDefendersPerCity; index += 1) {
            createDefender(state, config, now, fakeCity.cityId);
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
    controller.nextShotAt = now + config.botShootIntervalMs;
    state.seq += 1;
    const bulletId = `bullet_${state.seq}`;
    state.bullets.set(bulletId, {
        id: bulletId,
        ownerId: bot.id,
        city: bot.city,
        x: bot.x,
        y: bot.y,
        direction: headingToTarget(bot.x, bot.y, target.x, target.y, bot.direction),
        speed: config.bulletSpeed,
        type: 0
    });
    emitter.emit("bullet.fired", {
        id: bulletId,
        ownerId: bot.id,
        city: bot.city,
        position: { x: bot.x, y: bot.y },
        direction: state.bullets.get(bulletId)!.direction,
        type: 0
    });
};

export const tickDefenderBots = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    now: number,
    deltaMs: number
): boolean => {
    let dirty = spawnDefendersForActiveCities(state, config, now);
    for (const [botId, controller] of state.botControllers.entries()) {
        if (controller.botType !== DEFENDER_TYPE) {
            continue;
        }
        const bot = state.players.get(botId);
        if (!bot || !bot.isBot || bot.health <= 0) {
            state.botControllers.delete(botId);
            state.players.delete(botId);
            dirty = true;
            continue;
        }
        const fakeCity = state.fakeCities.get(controller.homeCityId);
        if (!fakeCity?.active) {
            state.botControllers.delete(botId);
            state.players.delete(botId);
            dirty = true;
            continue;
        }
        const fallback = resolveCityCenter(controller.homeCityId, config);
        const nearest = nearestHumanPlayer(state, bot.x, bot.y, config.botDetectionRadius);
        const target = nearest ?? fallback;
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
        const safe = resolveSpawnPosition(state, bot.city, moved.x, moved.y, config);
        state.players.set(botId, {
            ...bot,
            direction,
            x: safe.x,
            y: safe.y
        });
        fireAtTarget(state, emitter, config, state.players.get(botId)!, controller, target, now);
        dirty = true;
    }

    return dirty;
};
