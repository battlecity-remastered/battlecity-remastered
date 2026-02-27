import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import { computeBotStandOffTarget, nearestHumanPlayer } from "./BotShared.js";

const SHOOT_RANGE_TILES = 16;
const STANDOFF_FACTOR = 0.5;
const MIN_TARGET_BUFFER_TILES = 1;
const BOT_HALF = 24;
const ITEM_TYPE_BOMB = 3;

type BotTarget = {
    id?: string;
    x: number;
    y: number;
    standOffPx: number;
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

export const pickDefenderTarget = (
    state: RuntimeState,
    config: RuntimeConfig,
    bot: RuntimePlayer,
    controller: RuntimeBotController,
    detectionRadius: number
): { id?: string; x: number; y: number; standOffPx: number } | null => {
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

export const resolveDefenderMovementFallback = (
    config: RuntimeConfig,
    bot: RuntimePlayer,
    attackTarget: { id?: string; x: number; y: number; standOffPx: number } | null
): { id?: string; x: number; y: number } | null => {
    if (!attackTarget) {
        return null;
    }
    const standOffFactor = attackTarget.standOffPx / (config.tileSize * SHOOT_RANGE_TILES);
    const standOffTarget = computeBotStandOffTarget(config, bot, attackTarget, {
        shootRangeTiles: SHOOT_RANGE_TILES,
        standoffFactor: standOffFactor,
        minTargetBufferTiles: MIN_TARGET_BUFFER_TILES
    });
    return attackTarget.id
        ? { id: attackTarget.id, ...standOffTarget }
        : standOffTarget;
};
