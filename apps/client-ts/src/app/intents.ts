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
const ACTION_COOLDOWN_MS = 800;
const TILE_SIZE = 48;

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

const asBuildingPlaceIntent = (state: ClientState): Intent<"building.place.request"> => {
    const tileX = Math.floor(state.pointer.x / TILE_SIZE);
    const tileY = Math.floor(state.pointer.y / TILE_SIZE);
    return {
        type: "building.place.request",
        payload: {
            ownerId: state.local.id ?? "",
            cityId: state.local.city,
            type: 109,
            tileX,
            tileY
        }
    };
};

const tryResolveDemolishTarget = (state: ClientState): string | null => {
    const tileX = Math.floor(state.pointer.x / TILE_SIZE);
    const tileY = Math.floor(state.pointer.y / TILE_SIZE);
    for (const building of state.buildings.values()) {
        if (building.cityId !== state.local.city) {
            continue;
        }
        if (building.tileX === tileX && building.tileY === tileY) {
            return building.id;
        }
    }
    return null;
};

const hasCooldownElapsed = (nowMs: number, lastAt: number): boolean => {
    return nowMs - lastAt > ACTION_COOLDOWN_MS;
};

const appendResearchIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.research || !hasCooldownElapsed(nowMs, state.local.lastResearchAt)) {
        return;
    }
    state.local.lastResearchAt = nowMs;
    intents.push({
        type: "research.start.request",
        payload: {
            cityId: state.local.city,
            researchType: 1
        }
    });
};

const appendFactoryCollectIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.collectFactory || !hasCooldownElapsed(nowMs, state.local.lastFactoryCollectAt)) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({
        type: "icon.pickup.request",
        payload: {
            cityId: state.local.city,
            itemType: 0,
            amount: 1
        }
    });
};

const appendHazardDeployIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (
        !state.controls.demolish
        || state.controls.ctrl
        || !hasCooldownElapsed(nowMs, state.local.lastHazardAt)
    ) {
        return;
    }
    state.local.lastHazardAt = nowMs;
    intents.push({
        type: "hazard.deploy.request",
        payload: {
            cityId: state.local.city,
            type: 1,
            position: {
                x: state.local.x,
                y: state.local.y
            },
            radius: 96,
            damage: 35,
            fuseMs: 1500
        }
    });
};

const appendItemUseIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || !hasCooldownElapsed(nowMs, state.local.lastItemUseAt)) {
        return;
    }
    state.local.lastItemUseAt = nowMs;
    intents.push({
        type: "item.use.request",
        payload: {
            itemType: 0
        }
    });
};

const appendOrbDropIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (
        !state.controls.build
        || state.controls.shift
        || state.controls.ctrl
        || !hasCooldownElapsed(nowMs, state.local.lastOrbAt)
    ) {
        return;
    }
    state.local.lastOrbAt = nowMs;
    intents.push({
        type: "orb.drop.request",
        payload: {
            sourceCityId: state.local.city,
            targetCityId: (state.local.city + 1) % 8
        }
    });
};

const appendDefenseDeployIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (
        !state.controls.build
        || !state.controls.shift
        || state.controls.ctrl
        || !hasCooldownElapsed(nowMs, state.local.lastOrbAt)
    ) {
        return;
    }
    state.local.lastOrbAt = nowMs;
    intents.push({
        type: "defense.deploy.request",
        payload: {
            cityId: state.local.city,
            type: 8,
            tileX: Math.floor(state.local.x / TILE_SIZE),
            tileY: Math.floor(state.local.y / TILE_SIZE)
        }
    });
};

const appendBuildingPlaceIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (
        !state.controls.build
        || !state.controls.ctrl
        || state.controls.shift
        || !state.pointer.inside
        || !hasCooldownElapsed(nowMs, state.local.lastBuildAt)
    ) {
        return;
    }
    state.local.lastBuildAt = nowMs;
    intents.push(asBuildingPlaceIntent(state));
};

const appendBuildingDemolishIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (
        !state.controls.demolish
        || !state.controls.ctrl
        || !state.pointer.inside
        || !hasCooldownElapsed(nowMs, state.local.lastDemolishAt)
    ) {
        return;
    }
    const id = tryResolveDemolishTarget(state);
    if (!id) {
        return;
    }
    state.local.lastDemolishAt = nowMs;
    intents.push({
        type: "building.demolish.request",
        payload: {
            id,
            cityId: state.local.city
        }
    });
};

const appendLobbyLeaveIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.leaveLobby || !hasCooldownElapsed(nowMs, state.local.lastLobbyLeaveAt)) {
        return;
    }
    state.local.lastLobbyLeaveAt = nowMs;
    intents.push({
        type: "lobby.leave.request",
        payload: {}
    });
};

const appendChatIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.ctrl || !state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastFactoryCollectAt)) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({
        type: "chat.message.request",
        payload: {
            text: "status",
            scope: "team"
        }
    });
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

    appendBuildingPlaceIntent(state, nowMs, intents);
    appendBuildingDemolishIntent(state, nowMs, intents);
    appendResearchIntent(state, nowMs, intents);
    appendFactoryCollectIntent(state, nowMs, intents);
    appendHazardDeployIntent(state, nowMs, intents);
    appendItemUseIntent(state, nowMs, intents);
    appendDefenseDeployIntent(state, nowMs, intents);
    appendOrbDropIntent(state, nowMs, intents);
    appendLobbyLeaveIntent(state, nowMs, intents);
    appendChatIntent(state, nowMs, intents);

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
