import citySpawns from "../../../data/citySpawns.json" with { type: "json" };
import {
    advancePointByTankHeading32,
    clampToWorld,
    collidesAt,
    findNearestSafePoint,
    type CollisionPoint,
    type CollisionWorld
} from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import { buildCollisionWorld } from "../../runtime/collision-world.js";
import { findBotPath, type BotPathContext } from "./BotPathingService.js";

type CitySpawn = {
    tileX?: number;
    tileY?: number;
};

const CITY_SPAWNS = citySpawns as Record<string, CitySpawn>;
const BOT_RADIUS = 18;
const BOT_SPRITE_SIZE = 48;
const BOT_SPRITE_HALF = BOT_SPRITE_SIZE / 2;

const normalizeHeading = (direction: number): number => {
    const normalized = Math.round(direction) % 32;
    return normalized < 0 ? normalized + 32 : normalized;
};

const toFinite = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
};

const toCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x + BOT_SPRITE_HALF,
        y: y + BOT_SPRITE_HALF
    };
};

const fromCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x - BOT_SPRITE_HALF,
        y: y - BOT_SPRITE_HALF
    };
};

const clampTopLeftToWorld = (x: number, y: number, mapMax: number): CollisionPoint => {
    const max = mapMax - BOT_SPRITE_SIZE;
    return {
        x: Math.max(0, Math.min(max, x)),
        y: Math.max(0, Math.min(max, y))
    };
};

const resolveStartPoint = (world: CollisionWorld, center: CollisionPoint): CollisionPoint => {
    if (!collidesAt(world, center, BOT_RADIUS)) {
        return center;
    }
    return findNearestSafePoint(world, center, BOT_RADIUS, 8, 192) ?? clampToWorld(world, center, BOT_RADIUS);
};

const moveWithSlide = (world: CollisionWorld, current: CollisionPoint, desired: CollisionPoint): CollisionPoint => {
    const clampedDesired = clampToWorld(world, desired, BOT_RADIUS);
    if (!collidesAt(world, clampedDesired, BOT_RADIUS)) {
        return clampedDesired;
    }

    const slideX = clampToWorld(world, { x: clampedDesired.x, y: current.y }, BOT_RADIUS);
    if (!collidesAt(world, slideX, BOT_RADIUS)) {
        return slideX;
    }

    const slideY = clampToWorld(world, { x: current.x, y: clampedDesired.y }, BOT_RADIUS);
    if (!collidesAt(world, slideY, BOT_RADIUS)) {
        return slideY;
    }

    return clampToWorld(world, current, BOT_RADIUS);
};

export const resolveCityCenter = (cityId: number, config: RuntimeConfig): { x: number; y: number } => {
    const fromMap = CITY_SPAWNS[String(cityId)];
    const tileX = toFinite(fromMap?.tileX);
    const tileY = toFinite(fromMap?.tileY);
    if (tileX !== null && tileY !== null) {
        return {
            x: (Math.floor(tileX) * config.tileSize) + (config.tileSize * 1.5),
            y: (Math.floor(tileY) * config.tileSize) + (config.tileSize * 1.5)
        };
    }

    const side = Math.max(1, Math.round(Math.sqrt(Math.max(1, config.cityCount))));
    const gx = cityId % side;
    const gy = Math.floor(cityId / side);
    return {
        x: (gx + 1.5) * config.tileSize * 6,
        y: (gy + 1.5) * config.tileSize * 6
    };
};

export const nearestHumanPlayer = (
    state: RuntimeState,
    x: number,
    y: number,
    maxDistance: number,
    cityId?: number
): { id: string; x: number; y: number; city: number } | null => {
    let nearest: { id: string; x: number; y: number; city: number } | null = null;
    let nearestDistance = maxDistance * maxDistance;

    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        if (cityId !== undefined && player.city !== cityId) {
            continue;
        }
        const dx = player.x - x;
        const dy = player.y - y;
        const distance = (dx * dx) + (dy * dy);
        if (distance >= nearestDistance) {
            continue;
        }
        nearestDistance = distance;
        nearest = {
            id: player.id,
            x: player.x,
            y: player.y,
            city: player.city
        };
    }

    return nearest;
};

export const headingToTarget = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fallback: number
): number => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return normalizeHeading(fallback);
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return normalizeHeading(fallback);
    }
    const normX = dx / length;
    const normY = dy / length;
    const theta = Math.atan2(-normX, -normY);
    return normalizeHeading((-theta / Math.PI) * 16);
};

export const moveBotByHeading = (
    state: RuntimeState,
    config: RuntimeConfig,
    x: number,
    y: number,
    direction: number,
    speed: number,
    deltaMs: number
): { x: number; y: number } => {
    const normalizedDirection = normalizeHeading(direction);
    const currentCenter = toCollisionPoint(x, y);
    const world = buildCollisionWorld(state, config, currentCenter.x, currentCenter.y);
    const safeCenter = resolveStartPoint(world, currentCenter);
    const advancedCenter = advancePointByTankHeading32(
        safeCenter.x,
        safeCenter.y,
        normalizedDirection,
        speed,
        deltaMs
    );
    const resolvedCenter = moveWithSlide(world, safeCenter, advancedCenter);
    const topLeft = fromCollisionPoint(resolvedCenter.x, resolvedCenter.y);
    return clampTopLeftToWorld(topLeft.x, topLeft.y, config.mapMax);
};

export const isBotTopLeftPositionValid = (
    state: RuntimeState,
    config: RuntimeConfig,
    x: number,
    y: number
): boolean => {
    const topLeft = clampTopLeftToWorld(x, y, config.mapMax);
    const center = toCollisionPoint(topLeft.x, topLeft.y);
    const world = buildCollisionWorld(state, config, center.x, center.y);
    const clamped = clampToWorld(world, center, BOT_RADIUS);
    return !collidesAt(world, clamped, BOT_RADIUS);
};

export const normalizeBotHeading = (direction: number): number => {
    return normalizeHeading(direction);
};

export const heading32ToBulletHeading = (direction: number): number => {
    return normalizeHeading(direction - 8);
};

export const botFireAtTarget = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    bot: RuntimePlayer,
    controller: RuntimeBotController,
    target: { x: number; y: number },
    now: number,
    options: { shootRangeTiles: number; muzzleOffsetPx: number; shootIntervalMs: number; bulletCity: number }
): void => {
    if (now < controller.nextShotAt) {
        return;
    }

    const botCenterX = bot.x + BOT_SPRITE_HALF;
    const botCenterY = bot.y + BOT_SPRITE_HALF;
    const targetCenterX = target.x + BOT_SPRITE_HALF;
    const targetCenterY = target.y + BOT_SPRITE_HALF;
    const dx = targetCenterX - botCenterX;
    const dy = targetCenterY - botCenterY;
    const rangeSq = (dx * dx) + (dy * dy);
    const maxRange = config.tileSize * options.shootRangeTiles;
    if (rangeSq > (maxRange * maxRange)) {
        return;
    }

    const direction = headingToTarget(botCenterX, botCenterY, targetCenterX, targetCenterY, bot.direction);
    const bulletDirection = heading32ToBulletHeading(direction);
    const radians = (-normalizeHeading(direction) / 16) * Math.PI;
    const muzzleX = botCenterX + (Math.sin(radians) * -options.muzzleOffsetPx);
    const muzzleY = botCenterY + (Math.cos(radians) * -options.muzzleOffsetPx);

    controller.nextShotAt = now + options.shootIntervalMs;
    state.seq += 1;
    const bulletId = `bullet_${state.seq}`;
    state.bullets.set(bulletId, {
        id: bulletId,
        ownerId: bot.id,
        city: options.bulletCity,
        x: muzzleX,
        y: muzzleY,
        direction: bulletDirection,
        speed: config.bulletSpeed,
        type: 0
    });
    emitter.emit("bullet.fired", {
        id: bulletId,
        ownerId: bot.id,
        city: options.bulletCity,
        position: { x: muzzleX, y: muzzleY },
        direction: bulletDirection,
        type: 0
    });
};

export const maybeAdvancePathWaypoint = (
    controller: RuntimeBotController,
    bot: RuntimePlayer,
    reachedDistancePx: number
): void => {
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
    if ((dx * dx) + (dy * dy) > (reachedDistancePx * reachedDistancePx)) {
        return;
    }

    controller.pathIndex = index + 1;
};

export const maybeRebuildBotPath = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    controller: RuntimeBotController,
    bot: RuntimePlayer,
    target: { id?: string; x: number; y: number },
    options: {
        searchRadiusTiles: number;
        maxNodes: number;
        pathfindIntervalMs: number;
        fallbackTarget?: { x: number; y: number };
        pathContext?: BotPathContext;
    }
): void => {
    const targetChanged = (target.id ?? "") !== (controller.targetPlayerId ?? "");
    if (!targetChanged && now < (controller.nextPathAt ?? 0)) {
        return;
    }

    let path = findBotPath(state, config, bot.x, bot.y, target.x, target.y, {
        searchRadiusTiles: options.searchRadiusTiles,
        maxNodes: options.maxNodes,
        context: options.pathContext
    });
    if (!path && options.fallbackTarget) {
        path = findBotPath(state, config, bot.x, bot.y, options.fallbackTarget.x, options.fallbackTarget.y, {
            searchRadiusTiles: options.searchRadiusTiles,
            maxNodes: options.maxNodes,
            context: options.pathContext
        });
    }

    if (path) {
        controller.path = path;
    } else {
        delete controller.path;
    }
    controller.pathIndex = 0;
    controller.nextPathAt = now + options.pathfindIntervalMs;
    if (target.id) {
        controller.targetPlayerId = target.id;
    } else {
        delete controller.targetPlayerId;
    }
};

export const computeBotStandOffTarget = (
    config: RuntimeConfig,
    bot: RuntimePlayer,
    target: { x: number; y: number },
    options: { shootRangeTiles: number; standoffFactor: number; minTargetBufferTiles: number }
): { x: number; y: number } => {
    const botCenterX = bot.x + BOT_SPRITE_HALF;
    const botCenterY = bot.y + BOT_SPRITE_HALF;
    const targetCenterX = target.x + BOT_SPRITE_HALF;
    const targetCenterY = target.y + BOT_SPRITE_HALF;
    const dx = targetCenterX - botCenterX;
    const dy = targetCenterY - botCenterY;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance < 1e-3) {
        return { x: target.x, y: target.y };
    }

    const shootRangePx = config.tileSize * options.shootRangeTiles;
    const desiredStandOffPx = shootRangePx * options.standoffFactor;
    const minBufferPx = config.tileSize * options.minTargetBufferTiles;
    const keepBackPx = Math.max(minBufferPx, Math.min(shootRangePx * 0.95, desiredStandOffPx));
    const ratio = Math.max(0, (distance - keepBackPx) / distance);
    const goalCenterX = botCenterX + (dx * ratio);
    const goalCenterY = botCenterY + (dy * ratio);

    return {
        x: goalCenterX - BOT_SPRITE_HALF,
        y: goalCenterY - BOT_SPRITE_HALF
    };
};

export const resolvePathMovementTarget = (
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

export const buildBotPathOptions = (
    fallbackPathTarget: { x: number; y: number } | undefined,
    searchRadiusTiles: number,
    maxNodes: number,
    pathfindIntervalMs: number,
    pathContext: BotPathContext
): {
    searchRadiusTiles: number;
    maxNodes: number;
    pathfindIntervalMs: number;
    fallbackTarget?: { x: number; y: number };
    pathContext?: BotPathContext;
} => {
    if (fallbackPathTarget) {
        return {
            searchRadiusTiles,
            maxNodes,
            pathfindIntervalMs,
            fallbackTarget: fallbackPathTarget,
            pathContext
        };
    }
    return {
        searchRadiusTiles,
        maxNodes,
        pathfindIntervalMs,
        pathContext
    };
};

export const stepBotAlongPath = (
    state: RuntimeState,
    config: RuntimeConfig,
    now: number,
    deltaMs: number,
    controller: RuntimeBotController,
    bot: RuntimePlayer,
    movementTargetFallback: { x: number; y: number },
    options: {
        fallbackPathTarget: { x: number; y: number } | undefined;
        searchRadiusTiles: number;
        maxNodes: number;
        pathfindIntervalMs: number;
        pathContext: BotPathContext;
        waypointReachedDistancePx: number;
        moveSpeed: number;
    }
): RuntimePlayer => {
    const pathOptions = buildBotPathOptions(
        options.fallbackPathTarget,
        options.searchRadiusTiles,
        options.maxNodes,
        options.pathfindIntervalMs,
        options.pathContext
    );
    maybeRebuildBotPath(state, config, now, controller, bot, movementTargetFallback, pathOptions);
    maybeAdvancePathWaypoint(controller, bot, options.waypointReachedDistancePx);
    const movementTarget = resolvePathMovementTarget(controller, movementTargetFallback);
    const direction = headingToTarget(
        bot.x + BOT_SPRITE_HALF,
        bot.y + BOT_SPRITE_HALF,
        movementTarget.x + BOT_SPRITE_HALF,
        movementTarget.y + BOT_SPRITE_HALF,
        bot.direction
    );
    const moved = moveBotByHeading(
        state,
        config,
        bot.x,
        bot.y,
        direction,
        options.moveSpeed,
        deltaMs
    );
    const updatedBot: RuntimePlayer = {
        ...bot,
        direction,
        x: moved.x,
        y: moved.y
    };
    state.players.set(bot.id, updatedBot);
    return updatedBot;
};
