import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { resolvePointerWorldTile } from "../gameplay/world-viewport.js";
import { resolveBuildPlacementTile } from "../ui/build-menu/GhostPlacement.js";
import {
    ITEM_TYPE_BOMB,
    BUILDING_FOOTPRINT_TILES,
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_DFG,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_MINE,
    TILE
} from "../render/parity/constants.js";
import { resolveHazardDropPlacement } from "../gameplay/items/drop-placement.js";
import { resolveFactoryPickupItemType } from "./intents-factory.js";

const ACTION_COOLDOWN_MS = 800;
const HAZARD_DROP_TYPES = new Set([ITEM_TYPE_BOMB, ITEM_TYPE_MINE, ITEM_TYPE_DFG]);

type EnvelopeType = EventEnvelope["type"];
export type Intent<TType extends EnvelopeType = EnvelopeType> = {
    type: TType;
    payload: TType extends keyof KnownEventPayloadByType ? KnownEventPayloadByType[TType] : unknown;
};

const hasCooldownElapsed = (nowMs: number, lastAt: number): boolean => nowMs - lastAt > ACTION_COOLDOWN_MS;
const asBuildingPlaceIntent = (
    state: ClientState,
    tileX: number,
    tileY: number,
    buildType: number
): Intent<"building.place.request"> => ({
    type: "building.place.request",
    payload: {
        ownerId: state.local.id ?? "",
        cityId: state.local.city,
        type: buildType,
        tileX,
        tileY
    }
});

const tryResolveDemolishTarget = (state: ClientState): string | null => {
    const pointerTile = resolvePointerWorldTile(state);
    if (!pointerTile) {
        return null;
    }
    const tileX = pointerTile.tileX;
    const tileY = pointerTile.tileY;
    for (const building of state.buildings.values()) {
        if (building.cityId !== state.local.city) {
            continue;
        }
        if (
            tileX >= building.tileX
            && tileX < (building.tileX + BUILDING_FOOTPRINT_TILES)
            && tileY >= building.tileY
            && tileY < (building.tileY + BUILDING_FOOTPRINT_TILES)
        ) {
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
    const requestedItemType = resolveFactoryPickupItemType(state);
    if (requestedItemType === null) {
        return;
    }
    state.local.lastFactoryCollectAt = nowMs;
    intents.push({
        type: "icon.pickup.request",
        payload: {
            cityId: state.local.city,
            itemType: requestedItemType,
            amount: 1
        }
    });
};

const appendItemUseIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastItemUseAt)) {
        return;
    }
    state.local.lastItemUseAt = nowMs;
    intents.push({ type: "item.use.request", payload: { itemType: ITEM_TYPE_MEDKIT } });
};

const appendInventoryDropIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || !state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastHazardAt)) {
        return;
    }
    const selectedItemType = state.ui.selectedInventoryItemType;
    if (selectedItemType === null || !HAZARD_DROP_TYPES.has(selectedItemType)) {
        return;
    }
    const placement = resolveHazardDropPlacement(state);
    if (!placement) {
        return;
    }
    state.local.lastHazardAt = nowMs;
    intents.push({
        type: "hazard.deploy.request",
        payload: {
            cityId: state.local.city,
            type: selectedItemType,
            position: {
                x: placement.x,
                y: placement.y
            },
            armed: selectedItemType === ITEM_TYPE_BOMB ? state.ui.bombArmed : true
        }
    });
};

const appendCloakUseIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useCloak || !hasCooldownElapsed(nowMs, state.local.lastItemUseAt)) {
        return;
    }
    state.local.lastItemUseAt = nowMs;
    intents.push({ type: "item.use.request", payload: { itemType: ITEM_TYPE_CLOAK } });
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
            tileX: Math.floor(state.local.x / TILE),
            tileY: Math.floor(state.local.y / TILE)
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
    const queuedPlacement = state.ui.pendingBuildPlacement;
    if (queuedPlacement) {
        state.ui.pendingBuildPlacement = null;
        if (state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastBuildAt)) {
            return;
        }
        state.local.lastBuildAt = nowMs;
        intents.push(asBuildingPlaceIntent(state, queuedPlacement.tileX, queuedPlacement.tileY, queuedPlacement.type));
        return;
    }
    if (!state.controls.build || !state.controls.ctrl || state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastBuildAt)) {
        return;
    }
    const placementTile = resolveBuildPlacementTile(state);
    if (!placementTile) {
        return;
    }
    state.local.lastBuildAt = nowMs;
    intents.push(asBuildingPlaceIntent(state, placementTile.tileX, placementTile.tileY, state.ui.selectedBuildType));
};

const appendBuildingDemolishIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.demolish || !state.controls.ctrl || !hasCooldownElapsed(nowMs, state.local.lastDemolishAt)) {
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
    state.controls.leaveLobby = false;
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
    appendCloakUseIntent(state, nowMs, intents);
    appendItemUseIntent(state, nowMs, intents);
    appendInventoryDropIntent(state, nowMs, intents);
    appendDefenseDeployIntent(state, nowMs, intents);
    appendOrbDropIntent(state, nowMs, intents);
    appendLobbyLeaveIntent(state, nowMs, intents);
    appendChatIntent(state, nowMs, intents);
};
