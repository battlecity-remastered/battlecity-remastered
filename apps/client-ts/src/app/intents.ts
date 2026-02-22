import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import { normalizeHeading32 } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";

type EnvelopeType = EventEnvelope["type"];

export type Intent<TType extends EnvelopeType = EnvelopeType> = {
    type: TType;
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;
};

const TURN_SPEED_STEPS_PER_SECOND = 12;
const SHOT_COOLDOWN_MS = 1000;

export type TickPlan = {
    intents: ReadonlyArray<Intent>;
    isMoving: boolean;
    direction: number;
    shouldShoot: boolean;
};

const asBulletIntent = (state: ClientState): Intent<"bullet.fire.request"> => {
    return {
        type: "bullet.fire.request",
        payload: {
            ownerId: state.local.id ?? "",
            position: {
                x: state.local.x,
                y: state.local.y
            },
            direction: state.local.direction,
            type: 0
        }
    };
};

const asInitialBuildingIntent = (state: ClientState): Intent<"building.place.request"> => {
    return {
        type: "building.place.request",
        payload: {
            ownerId: state.local.id ?? "",
            cityId: state.local.city,
            type: 109,
            tileX: 10,
            tileY: 10
        }
    };
};

const resolveDirection = (state: ClientState, dtMs: number): number => {
    const turn = Number(state.controls.turnRight) - Number(state.controls.turnLeft);
    if (turn === 0) {
        return normalizeHeading32(state.local.direction);
    }

    const next = state.local.direction + (turn * TURN_SPEED_STEPS_PER_SECOND * (dtMs / 1000));
    return normalizeHeading32(next);
};

export const buildTickPlan = (state: ClientState, nowMs: number, dtMs: number): TickPlan => {
    if (!state.local.id) {
        return {
            intents: [],
            isMoving: false,
            direction: state.local.direction,
            shouldShoot: false
        };
    }

    const intents: Intent[] = [];
    const nextDirection = resolveDirection(state, dtMs);
    const isMoving = state.controls.moveForward;

    state.local.direction = nextDirection;
    intents.push({
        type: "player.update",
        payload: {
            id: state.local.id,
            city: state.local.city,
            direction: nextDirection,
            isMoving,
            offset: {
                x: state.local.x,
                y: state.local.y
            }
        }
    });

    let shouldShoot = false;
    if (state.controls.shoot && nowMs - state.local.lastShotAt > SHOT_COOLDOWN_MS) {
        state.local.lastShotAt = nowMs;
        intents.push(asBulletIntent(state));
        shouldShoot = true;
    }

    if (!state.local.placedInitialBuilding) {
        state.local.placedInitialBuilding = true;
        intents.push(asInitialBuildingIntent(state));
    }

    return {
        intents,
        isMoving,
        direction: nextDirection,
        shouldShoot
    };
};

export const buildTickIntents = (state: ClientState, nowMs: number, dtMs: number): ReadonlyArray<Intent> => {
    return buildTickPlan(state, nowMs, dtMs).intents;
};
