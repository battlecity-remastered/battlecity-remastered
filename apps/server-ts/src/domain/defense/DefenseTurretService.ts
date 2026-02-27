import { normalizeHeading32 } from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeConfig, RuntimeDefense, RuntimeState } from "../../runtime/types.js";
import { headingToTarget, heading32ToBulletHeading } from "../bots/BotShared.js";

const DEFENSE_HALF = 24;
const IDLE_SPIN_STEP = 0;
const TRACK_STEP = 16;
const AIM_TOLERANCE = 1;
const MUZZLE_OFFSET_PX = 30;
const TARGET_RANGE_PX = 400;

const DEFENSE_TYPE_TURRET = 9;
const DEFENSE_TYPE_SLEEPER = 10;
const DEFENSE_TYPE_PLASMA = 11;
const FIRING_DEFENSE_TYPES = new Set([DEFENSE_TYPE_TURRET, DEFENSE_TYPE_SLEEPER, DEFENSE_TYPE_PLASMA]);

const BULLET_TYPE_BY_DEFENSE: Readonly<Record<number, number>> = {
    [DEFENSE_TYPE_TURRET]: 0,
    [DEFENSE_TYPE_SLEEPER]: 1,
    [DEFENSE_TYPE_PLASMA]: 2
};

const COOLDOWN_MS_BY_DEFENSE: Readonly<Record<number, number>> = {
    [DEFENSE_TYPE_TURRET]: 400,
    [DEFENSE_TYPE_SLEEPER]: 400,
    [DEFENSE_TYPE_PLASMA]: 400
};

const shortestSignedDelta = (from: number, to: number): number => {
    const raw = ((to - from + 48) % 32) - 16;
    return raw === -16 ? 16 : raw;
};

const stepHeadingToward = (
    current: number,
    target: number,
    maxStep: number
): number => {
    const delta = shortestSignedDelta(current, target);
    if (Math.abs(delta) <= maxStep) {
        return normalizeHeading32(target);
    }
    return normalizeHeading32(current + (delta > 0 ? maxStep : -maxStep));
};

const resolveDefenseCenter = (
    defense: RuntimeDefense,
    tileSize: number
): { x: number; y: number } => {
    return {
        x: (defense.tileX * tileSize) + DEFENSE_HALF,
        y: (defense.tileY * tileSize) + DEFENSE_HALF
    };
};

const resolveNearestEnemy = (
    state: RuntimeState,
    defense: RuntimeDefense,
    centerX: number,
    centerY: number,
    maxDistancePx: number
): { x: number; y: number; distanceSq: number } | null => {
    const maxDistanceSq = maxDistancePx * maxDistancePx;
    let nearest: { x: number; y: number; distanceSq: number } | null = null;

    for (const player of state.players.values()) {
        if (player.city === defense.cityId || player.health <= 0) {
            continue;
        }
        const targetX = player.x + DEFENSE_HALF;
        const targetY = player.y + DEFENSE_HALF;
        const dx = targetX - centerX;
        const dy = targetY - centerY;
        const distanceSq = (dx * dx) + (dy * dy);
        if (distanceSq > maxDistanceSq) {
            continue;
        }
        if (!nearest || distanceSq < nearest.distanceSq) {
            nearest = {
                x: targetX,
                y: targetY,
                distanceSq
            };
        }
    }

    return nearest;
};

const emitOrientationUpdate = (
    emitter: RuntimeEmitter,
    defense: RuntimeDefense
): void => {
    const orientation = normalizeHeading32(defense.orientation ?? 0);
    emitter.emit("defense.update", {
        id: defense.id,
        health: defense.health,
        maxHealth: defense.maxHealth,
        orientation
    });
};

const fireFromDefense = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    defense: RuntimeDefense,
    orientation: number,
    nowMs: number
): void => {
    const bulletType = BULLET_TYPE_BY_DEFENSE[defense.type] ?? 0;
    const direction = normalizeHeading32(orientation);
    const bulletDirection = heading32ToBulletHeading(direction);
    const center = resolveDefenseCenter(defense, config.tileSize);
    const radians = (-direction / 16) * Math.PI;
    const muzzleX = center.x + (Math.sin(radians) * -MUZZLE_OFFSET_PX);
    const muzzleY = center.y + (Math.cos(radians) * -MUZZLE_OFFSET_PX);

    state.seq += 1;
    const bulletId = `bullet_${state.seq}`;
    state.bullets.set(bulletId, {
        id: bulletId,
        ownerId: defense.id,
        city: defense.cityId,
        x: muzzleX,
        y: muzzleY,
        direction: bulletDirection,
        speed: config.bulletSpeed,
        type: bulletType
    });
    emitter.emit("bullet.fired", {
        id: bulletId,
        ownerId: defense.id,
        city: defense.cityId,
        position: { x: muzzleX, y: muzzleY },
        direction: bulletDirection,
        type: bulletType
    });
    const cooldown = COOLDOWN_MS_BY_DEFENSE[defense.type] ?? 900;
    defense.nextShotAt = nowMs + cooldown;
};

export const tickDefenseTurrets = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    nowMs: number
): void => {
    const maxDistancePx = TARGET_RANGE_PX;

    for (const defense of state.defenses.values()) {
        if (!FIRING_DEFENSE_TYPES.has(defense.type) || defense.health <= 0) {
            continue;
        }

        const center = resolveDefenseCenter(defense, config.tileSize);
        const target = resolveNearestEnemy(state, defense, center.x, center.y, maxDistancePx);
        const currentOrientation = normalizeHeading32(defense.orientation ?? 0);
        let nextOrientation = currentOrientation;
        let desiredOrientation = currentOrientation;

        if (target) {
            desiredOrientation = headingToTarget(
                center.x,
                center.y,
                target.x,
                target.y,
                currentOrientation
            );
            nextOrientation = stepHeadingToward(currentOrientation, desiredOrientation, TRACK_STEP);
        } else {
            nextOrientation = normalizeHeading32(currentOrientation + IDLE_SPIN_STEP);
        }

        if (nextOrientation !== currentOrientation || defense.orientation === undefined) {
            defense.orientation = nextOrientation;
            emitOrientationUpdate(emitter, defense);
        }

        if (!target) {
            continue;
        }

        const aligned = Math.abs(shortestSignedDelta(nextOrientation, desiredOrientation)) <= AIM_TOLERANCE;
        if (!aligned) {
            continue;
        }

        if (nowMs < (defense.nextShotAt ?? 0)) {
            continue;
        }

        fireFromDefense(state, emitter, config, defense, nextOrientation, nowMs);
    }
};
