import type { EventEnvelope, KnownEventPayloadByType } from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { resolvePointerWorldTile } from "../gameplay/world-viewport.js";
import { resolveBuildPlacementTile } from "../ui/build-menu/GhostPlacement.js";
import {
    ITEM_TYPE_BOMB,
    BUILDING_FOOTPRINT_TILES,
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_DFG,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_LASER,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ROCKET,
    TILE
} from "../render/parity/constants.js";

const ACTION_COOLDOWN_MS = 800;
const FACTORY_DROP_OFFSET_X = 56;
const FACTORY_DROP_OFFSET_Y = 102;
const FACTORY_PICKUP_RANGE = 24;
const HAZARD_DROP_TYPES = new Set([ITEM_TYPE_BOMB, ITEM_TYPE_MINE, ITEM_TYPE_DFG]);
const MAP_DROP_PICKUP_TYPES = new Set([
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_MINE,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_DFG,
    ITEM_TYPE_LASER
]);

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

const isWithinFactoryPickupRange = (dx: number, dy: number): boolean => {
    return Math.abs(dx) <= FACTORY_PICKUP_RANGE && Math.abs(dy) <= FACTORY_PICKUP_RANGE;
};

const resolveNearestHazardPickupItemType = (state: ClientState, cityId: number): number | null => {
    let nearestHazardPickup: { itemType: number; distanceSq: number } | null = null;
    for (const hazard of state.hazards.values()) {
        if (hazard.cityId !== cityId || !MAP_DROP_PICKUP_TYPES.has(hazard.type)) {
            continue;
        }
        const dx = hazard.x - state.local.x;
        const dy = hazard.y - state.local.y;
        if (!isWithinFactoryPickupRange(dx, dy)) {
            continue;
        }
        const distanceSq = (dx * dx) + (dy * dy);
        if (!nearestHazardPickup || distanceSq < nearestHazardPickup.distanceSq) {
            nearestHazardPickup = {
                itemType: hazard.type,
                distanceSq
            };
        }
    }
    return nearestHazardPickup?.itemType ?? null;
};

const resolveNearestFactoryPickupItemType = (
    state: ClientState,
    cityId: number,
    cityStock: ReadonlyMap<number, number>
): number | null => {
    let nearest: { itemType: number; distanceSq: number } | null = null;
    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId || Math.floor(building.type / 100) !== 1) {
            continue;
        }
        const itemType = building.type % 100;
        const stock = cityStock.get(itemType) ?? 0;
        if (stock <= 0) {
            continue;
        }

        const iconX = (building.tileX * TILE) + FACTORY_DROP_OFFSET_X;
        const iconY = (building.tileY * TILE) + FACTORY_DROP_OFFSET_Y;
        const dx = iconX - state.local.x;
        const dy = iconY - state.local.y;
        if (!isWithinFactoryPickupRange(dx, dy)) {
            continue;
        }

        const distanceSq = (dx * dx) + (dy * dy);
        if (!nearest || distanceSq < nearest.distanceSq) {
            nearest = { itemType, distanceSq };
        }
    }
    return nearest?.itemType ?? null;
};

const resolveFactoryStockFallbackItemType = (
    cityStock: ReadonlyMap<number, number>,
    selectedItemType: number | null
): number | null => {
    if (selectedItemType !== null && (cityStock.get(selectedItemType) ?? 0) > 0) {
        return selectedItemType;
    }
    if ((cityStock.get(ITEM_TYPE_LASER) ?? 0) > 0) {
        return ITEM_TYPE_LASER;
    }
    for (const [itemType, stock] of cityStock.entries()) {
        if (stock > 0) {
            return itemType;
        }
    }
    return null;
};

const resolveFactoryPickupItemType = (state: ClientState): number | null => {
    const cityId = state.local.city;
    const cityStock = state.factoryStock.get(cityId);
    const selected = state.ui.selectedInventoryItemType;

    const hazardPickupItemType = resolveNearestHazardPickupItemType(state, cityId);
    if (hazardPickupItemType !== null) {
        return hazardPickupItemType;
    }

    if (!cityStock) {
        return selected ?? ITEM_TYPE_LASER;
    }

    const factoryPickupItemType = resolveNearestFactoryPickupItemType(state, cityId, cityStock);
    if (factoryPickupItemType !== null) {
        return factoryPickupItemType;
    }

    return resolveFactoryStockFallbackItemType(cityStock, selected);
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
    const selectedItemType = state.ui.selectedInventoryItemType ?? 0;
    intents.push({ type: "item.use.request", payload: { itemType: selectedItemType } });
};

const appendInventoryDropIntent = (state: ClientState, nowMs: number, intents: Intent[]): void => {
    if (!state.controls.useItem || !state.controls.shift || !hasCooldownElapsed(nowMs, state.local.lastHazardAt)) {
        return;
    }
    const selectedItemType = state.ui.selectedInventoryItemType;
    if (selectedItemType === null || !HAZARD_DROP_TYPES.has(selectedItemType)) {
        return;
    }
    state.local.lastHazardAt = nowMs;
    intents.push({
        type: "hazard.deploy.request",
        payload: {
            cityId: state.local.city,
            type: selectedItemType,
            position: { x: state.local.x, y: state.local.y },
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
