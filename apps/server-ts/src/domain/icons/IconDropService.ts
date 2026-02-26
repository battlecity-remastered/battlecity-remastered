import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult } from "../../runtime/types.js";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { collectFactoryStock } from "../factories/FactoryService.js";
import { addInventoryItem, resolveInventoryCap } from "../inventory/InventoryService.js";

const HAZARD_PICKUP_RANGE = 24;
const FACTORY_PICKUP_RANGE = 24;
const TILE = 48;
const FACTORY_DROP_OFFSET_X = 56;
const FACTORY_DROP_OFFSET_Y = 102;
const PICKUP_HAZARD_TYPES = new Set([0, 1, 2, 3, 4, 6, 7, 12]);

export type IconPickupResult = {
    stock: KnownEventPayloadByType["factory.stock"];
    inventory: KnownEventPayloadByType["inventory.update"];
    confirmed: KnownEventPayloadByType["icon.pickup.confirmed"];
    removedHazardId?: string;
};

const resolveStockPayload = (
    state: RuntimeState,
    cityId: number,
    itemType: number
): KnownEventPayloadByType["factory.stock"] => {
    return {
        cityId,
        itemType,
        stock: state.factoryStock.get(cityId)?.get(itemType) ?? 0
    };
};

const pickupNearbyHazard = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["icon.pickup.request"]
): string | null => {
    if (!PICKUP_HAZARD_TYPES.has(payload.itemType)) {
        return null;
    }
    const player = state.players.get(socketId);
    if (!player) {
        return null;
    }

    let nearest: { id: string; distanceSq: number } | null = null;
    for (const hazard of state.hazards.values()) {
        if (hazard.cityId !== payload.cityId || hazard.type !== payload.itemType) {
            continue;
        }
        const dx = hazard.x - player.x;
        const dy = hazard.y - player.y;
        if (Math.abs(dx) > HAZARD_PICKUP_RANGE || Math.abs(dy) > HAZARD_PICKUP_RANGE) {
            continue;
        }
        const distanceSq = (dx * dx) + (dy * dy);
        if (!nearest || distanceSq < nearest.distanceSq) {
            nearest = { id: hazard.id, distanceSq };
        }
    }
    if (!nearest) {
        return null;
    }
    state.hazards.delete(nearest.id);
    return nearest.id;
};

const hasNearbyFactoryDrop = (
    state: RuntimeState,
    socketId: string,
    cityId: number,
    itemType: number
): boolean => {
    const player = state.players.get(socketId);
    if (!player) {
        return false;
    }

    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId) {
            continue;
        }
        if (building.type < 100 || Math.floor(building.type / 100) !== 1 || (building.type % 100) !== itemType) {
            continue;
        }
        const iconX = (building.tileX * TILE) + FACTORY_DROP_OFFSET_X;
        const iconY = (building.tileY * TILE) + FACTORY_DROP_OFFSET_Y;
        const dx = iconX - player.x;
        const dy = iconY - player.y;
        if (Math.abs(dx) <= FACTORY_PICKUP_RANGE && Math.abs(dy) <= FACTORY_PICKUP_RANGE) {
            return true;
        }
    }

    return false;
};

export const pickupIcon = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["icon.pickup.request"],
    config: RuntimeConfig
): CommandResult<IconPickupResult> => {
    const requestedAmount = Math.max(1, Math.floor(payload.amount ?? 1));
    const playerInventory = state.playerInventory.get(socketId);
    const currentCount = playerInventory?.get(payload.itemType) ?? 0;
    const cap = resolveInventoryCap(payload.itemType, config);
    const availableSpace = Math.max(0, cap - currentCount);
    if (availableSpace <= 0) {
        return rejectResult("inventory_empty");
    }

    // Always consume nearby dropped hazards first so one dropped icon can only be collected once.
    const pickedHazardId = pickupNearbyHazard(state, socketId, payload);
    if (pickedHazardId) {
        const hazardPickupAmount = Math.min(1, availableSpace);
        return {
            ok: true,
            value: {
                stock: resolveStockPayload(state, payload.cityId, payload.itemType),
                inventory: addInventoryItem(
                    state,
                    socketId,
                    payload.itemType,
                    hazardPickupAmount,
                    config
                ),
                confirmed: {
                    playerId: socketId,
                    cityId: payload.cityId,
                    itemType: payload.itemType,
                    amount: hazardPickupAmount
                },
                removedHazardId: pickedHazardId
            }
        };
    }

    // Factory stock pickups must occur near the matching factory icon.
    if (!hasNearbyFactoryDrop(state, socketId, payload.cityId, payload.itemType)) {
        return rejectResult("factory_empty");
    }

    const amount = Math.min(requestedAmount, availableSpace);
    const stock = collectFactoryStock(state, payload.cityId, payload.itemType, amount);
    if (!stock.ok) {
        return stock;
    }

    return {
        ok: true,
        value: {
            stock: stock.value,
            inventory: addInventoryItem(
                state,
                socketId,
                payload.itemType,
                amount,
                config
            ),
            confirmed: {
                playerId: socketId,
                cityId: payload.cityId,
                itemType: payload.itemType,
                amount
            }
        }
    };
};
