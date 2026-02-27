import type { ClientState } from "./state.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_CLOAK,
    ITEM_TYPE_DFG,
    ITEM_TYPE_FLARE,
    ITEM_TYPE_LASER,
    ITEM_TYPE_MEDKIT,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ROCKET,
    TILE
} from "../render/parity/constants.js";

const FACTORY_DROP_OFFSET_X = 56;
const FACTORY_DROP_OFFSET_Y = 102;
const FACTORY_PICKUP_RANGE = 24;
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
        if (building.cityId !== cityId || building.type < 100 || Math.floor(building.type / 100) !== 1) {
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

export const resolveFactoryPickupItemType = (state: ClientState): number | null => {
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
