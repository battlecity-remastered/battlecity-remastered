import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import { normalizeHeading32, normalizeThrottle } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";
import { appendActionIntents, type Intent } from "./intents-actions.js";
import {
    direction32ToBulletHeading,
    normalizeDirection32,
    resolveTankMuzzlePosition
} from "../gameplay/combat/shot-geometry.js";
import { ITEM_TYPE_FLARE, ITEM_TYPE_LASER, ITEM_TYPE_ROCKET } from "../render/parity/constants.js";

type EnvelopeType = EventEnvelope["type"];

export type { Intent };
export type TypedIntent<TType extends EnvelopeType = EnvelopeType> = {
    type: TType;
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;
};

const TURN_SPEED_STEPS_PER_SECOND = 12;
const SHOT_COOLDOWN_MS = 1000;
const FLARE_BURST_COOLDOWN_MS = 500;
const BULLET_TYPE_FLARE = 3;
const FLARE_BURST_SPREAD_OFFSETS = [4, 0, -4];

export type TickPlan = {
    intents: ReadonlyArray<Intent>;
    isMoving: boolean;
    throttle: number;
    direction: number;
    shouldShoot: boolean;
};

const asBulletIntent = (state: ClientState, bulletType: number): Intent<"bullet.fire.request"> => {
    const muzzle = resolveTankMuzzlePosition(state.local.x, state.local.y, state.local.direction);
    return {
        type: "bullet.fire.request",
        payload: {
            ownerId: state.local.id ?? "",
            position: { x: muzzle.x, y: muzzle.y },
            direction: direction32ToBulletHeading(state.local.direction),
            type: bulletType
        }
    };
};

const appendFlareBurstIntents = (state: ClientState, nowMs: number, intents: Intent[]): boolean => {
    if (!state.local.pendingFlareBurst) {
        return false;
    }
    state.local.pendingFlareBurst = false;

    const flareCount = state.inventory.get(ITEM_TYPE_FLARE) ?? 0;
    if (flareCount <= 0) {
        return false;
    }
    if (nowMs - state.local.lastFlareBurstAt <= FLARE_BURST_COOLDOWN_MS) {
        return false;
    }

    const direction = normalizeDirection32(state.local.direction);
    const reverseCenter = normalizeDirection32(direction + 16);
    const muzzle = resolveTankMuzzlePosition(state.local.x, state.local.y, reverseCenter);
    for (const offset of FLARE_BURST_SPREAD_OFFSETS) {
        const shotDirection = normalizeDirection32(reverseCenter + offset);
        intents.push({
            type: "bullet.fire.request",
            payload: {
                ownerId: state.local.id ?? "",
                position: { x: muzzle.x, y: muzzle.y },
                direction: direction32ToBulletHeading(shotDirection),
                type: BULLET_TYPE_FLARE
            }
        });
    }
    state.local.lastFlareBurstAt = nowMs;
    return true;
};

const resolveDirection = (state: ClientState, dtMs: number): number => {
    const turn = Number(state.controls.turnRight) - Number(state.controls.turnLeft);
    if (turn === 0) {
        return normalizeHeading32(state.local.direction);
    }
    const next = state.local.direction + (turn * TURN_SPEED_STEPS_PER_SECOND * (dtMs / 1000));
    return normalizeHeading32(next);
};

const resolveMovementThrottle = (state: ClientState): number => {
    const throttle = Number(state.controls.moveForward) - Number(state.controls.moveBackward);
    return normalizeThrottle(throttle);
};

const resolveShotBulletType = (state: ClientState, isMoving: boolean): number | null => {
    const rocketCount = state.inventory.get(ITEM_TYPE_ROCKET) ?? 0;
    if (!isMoving && rocketCount > 0) {
        return 1;
    }
    const laserCount = state.inventory.get(ITEM_TYPE_LASER) ?? 0;
    if (laserCount > 0) {
        return 0;
    }
    return null;
};

const appendPlayerUpdateIntent = (
    state: ClientState,
    nextDirection: number,
    isMoving: boolean,
    throttle: number,
    intents: Intent[]
): void => {
    intents.push({
        type: "player.update",
        payload: {
            id: state.local.id ?? "",
            city: state.local.city,
            direction: nextDirection,
            isMoving,
            throttle,
            offset: { x: state.local.x, y: state.local.y }
        }
    });
};

export const buildTickPlan = (state: ClientState, nowMs: number, dtMs: number): TickPlan => {
    if (!state.local.id) {
        state.ui.pendingBuildPlacement = null;
        return { intents: [], isMoving: false, throttle: 0, direction: state.local.direction, shouldShoot: false };
    }

    const intents: Intent[] = [];
    const nextDirection = resolveDirection(state, dtMs);
    const throttle = resolveMovementThrottle(state);
    const isMoving = throttle !== 0;

    state.local.direction = nextDirection;
    appendPlayerUpdateIntent(state, nextDirection, isMoving, throttle, intents);

    let shouldShoot = false;
    if (appendFlareBurstIntents(state, nowMs, intents)) {
        shouldShoot = true;
    }
    const shotBulletType = resolveShotBulletType(state, isMoving);
    if (state.controls.shoot && shotBulletType !== null && nowMs - state.local.lastShotAt > SHOT_COOLDOWN_MS) {
        state.local.lastShotAt = nowMs;
        intents.push(asBulletIntent(state, shotBulletType));
        shouldShoot = true;
    }

    appendActionIntents(state, nowMs, intents);
    return { intents, isMoving, throttle, direction: nextDirection, shouldShoot };
};

export const buildTickIntents = (state: ClientState, nowMs: number, dtMs: number): ReadonlyArray<Intent> => {
    return buildTickPlan(state, nowMs, dtMs).intents;
};
