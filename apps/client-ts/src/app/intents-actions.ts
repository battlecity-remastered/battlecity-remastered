import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state.js";

const ACTION_COOLDOWN_MS = 800;
const TILE_SIZE = 48;
const ITEM_TYPE_BOMB = 1;

type EnvelopeType = EventEnvelope["type"];
export type Intent<TType extends EnvelopeType = EnvelopeType> = {
    type: TType;
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;
};

const hasCooldownElapsed = (nowMs: number, lastAt: number): boolean => nowMs - lastAt > ACTION_COOLDOWN_MS;
const asBuildingPlaceIntent = (state: ClientState): Intent<"building.place.request"> => ({
    type: "building.place.request",
    payload: {
        ownerId: state.local.id ?? "",
        cityId: state.local.city,
        type: state.ui.selectedBuildType,
        tileX: Math.floor(state.pointer.x / TILE_SIZE),
        tileY: Math.floor(state.pointer.y / TILE_SIZE)
    }
});

const tryResolveDemolishTarget = (state: ClientState): string | null => {
    const tileX = Math.floor(state.pointer.x / TILE_SIZE);
    const tileY = Math.floor(state.pointer.y / TILE_SIZE);
    for (const building of state.buildings.values()) {
        if (building.cityId === state.local.city && building.tileX === tileX && building.tileY === tileY) {
            return building.id;
        }
    }
    return null;
};

const appendResearchIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.research || !hasCooldownElapsed(nowMs, state.local.lastResearchAt)) {
        return;
    }
    state.local.lastResearchAt = nowMs;
    intents.push({ type: "research.start.request", payload: { cityId: state.local.city, researchType: 1 } });
};

const appendFactoryCollectIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.collectFactory || !hasCooldownElapsed(nowMs, state.local.lastFactoryCollectAt)) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({ type: "icon.pickup.request", payload: { cityId: state.local.city, itemType: 0, amount: 1 } });
};

const appendHazardDeployIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.demolish || state.controls.ctrl || !hasCooldownElapsed(nowMs, state.local.lastHazardAt)) {
        return;
    }
    state.local.lastHazardAt = nowMs;
    intents.push({
        type: "hazard.deploy.request",
        payload: {
            cityId: state.local.city,
            type: 1,
            position: { x: state.local.x, y: state.local.y },
            radius: 96,
            damage: 35,
            fuseMs: 1500
        }
    });
};

const appendItemUseIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastItemUseAt)) {
        return;
    }
    state.local.lastItemUseAt = nowMs;
    const selectedItemType = state.ui.selectedInventoryItemType ?? 0;
    if (selectedItemType === ITEM_TYPE_BOMB && state.ui.bombArmed) {
        intents.push({
            type: "hazard.deploy.request",
            payload: {
                cityId: state.local.city,
                type: ITEM_TYPE_BOMB,
                position: { x: state.local.x, y: state.local.y },
                radius: 120,
                damage: 40,
                fuseMs: 1000
            }
        });
        return;
    }
    intents.push({ type: "item.use.request", payload: { itemType: selectedItemType } });
};

const appendInventoryDropIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || !state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastFactoryCollectAt)) {
        return;
    }
    const selectedItemType = state.ui.selectedInventoryItemType;
    if (selectedItemType === null) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({
        type: "icon:drop",
        payload: {
            itemType: selectedItemType,
            cityId: state.local.city,
            x: state.local.x,
            y: state.local.y
        }
    });
};

const appendDefenseDeployIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.build || !state.controls.shift || state.controls.ctrl || !hasCooldownElapsed(nowMs, state.local.lastOrbAt)) {
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

const appendOrbDropIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.build || state.controls.shift || state.controls.ctrl || !hasCooldownElapsed(nowMs, state.local.lastOrbAt)) {
        return;
    }
    state.local.lastOrbAt = nowMs;
    intents.push({
        type: "orb.drop.request",
        payload: { sourceCityId: state.local.city, targetCityId: (state.local.city + 1) % 8 }
    });
};

const appendBuildingPlaceIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.build || !state.controls.ctrl || state.controls.shift || !state.pointer.inside || !hasCooldownElapsed(nowMs, state.local.lastBuildAt)) {
        return;
    }
    state.local.lastBuildAt = nowMs;
    intents.push(asBuildingPlaceIntent(state));
};

const appendBuildingDemolishIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.demolish || !state.controls.ctrl || !state.pointer.inside || !hasCooldownElapsed(nowMs, state.local.lastDemolishAt)) {
        return;
    }
    const id = tryResolveDemolishTarget(state);
    if (!id) {
        return;
    }
    state.local.lastDemolishAt = nowMs;
    intents.push({ type: "building.demolish.request", payload: { id, cityId: state.local.city } });
};

const appendLobbyLeaveIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.leaveLobby || !hasCooldownElapsed(nowMs, state.local.lastLobbyLeaveAt)) {
        return;
    }
    state.local.lastLobbyLeaveAt = nowMs;
    intents.push({ type: "lobby.leave.request", payload: {} });
};

const appendChatIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.ctrl || !state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastFactoryCollectAt)) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({ type: "chat.message.request", payload: { text: "status", scope: "team" } });
};

export const appendActionIntents = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    appendBuildingPlaceIntent(state, nowMs, intents);
    appendBuildingDemolishIntent(state, nowMs, intents);
    appendResearchIntent(state, nowMs, intents);
    appendFactoryCollectIntent(state, nowMs, intents);
    appendHazardDeployIntent(state, nowMs, intents);
    appendItemUseIntent(state, nowMs, intents);
    appendInventoryDropIntent(state, nowMs, intents);
    appendDefenseDeployIntent(state, nowMs, intents);
    appendOrbDropIntent(state, nowMs, intents);
    appendLobbyLeaveIntent(state, nowMs, intents);
    appendChatIntent(state, nowMs, intents);
};
