import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state.js";

type EnvelopeType = EventEnvelope["type"];

export type Intent<TType extends EnvelopeType = EnvelopeType> = {
    type: TType;
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;
};

const ROTATION_STEPS = 32;
const SHOT_COOLDOWN_MS = 1000;

const asPlayerUpdateIntent = (state: ClientState): Intent<"player.update"> => {
    return {
        type: "player.update",
        payload: {
            id: state.local.id ?? "",
            city: state.local.city,
            direction: state.local.direction,
            isMoving: true,
            offset: {
                x: state.local.x,
                y: state.local.y
            }
        }
    };
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

export const buildTickIntents = (state: ClientState, nowMs: number): ReadonlyArray<Intent> => {
    if (!state.local.id) {
        return [];
    }

    const intents: Intent[] = [];

    state.local.direction = (state.local.direction + 1) % ROTATION_STEPS;
    intents.push(asPlayerUpdateIntent(state));

    if (nowMs - state.local.lastShotAt > SHOT_COOLDOWN_MS) {
        state.local.lastShotAt = nowMs;
        intents.push(asBulletIntent(state));
    }

    if (!state.local.placedInitialBuilding) {
        state.local.placedInitialBuilding = true;
        intents.push(asInitialBuildingIntent(state));
    }

    return intents;
};
