import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult } from "../../runtime/types.js";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { collectFactoryStock } from "../factories/FactoryService.js";
import { addInventoryItem, resolveInventoryCap } from "../inventory/InventoryService.js";

const HAZARD_PICKUP_RANGE = 24;
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
    const amount = Math.min(requestedAmount, availableSpace);

    const stock = collectFactoryStock(state, payload.cityId, payload.itemType, amount);
    let removedHazardId: string | undefined;
    let stockPayload: KnownEventPayloadByType["factory.stock"];
    if (!stock.ok) {
        const pickedHazardId = pickupNearbyHazard(state, socketId, payload);
        if (!pickedHazardId) {
            return stock;
        }
        removedHazardId = pickedHazardId;
        stockPayload = resolveStockPayload(state, payload.cityId, payload.itemType);
    } else {
        stockPayload = stock.value;
    }

    const inventory = addInventoryItem(
        state,
        socketId,
        payload.itemType,
        amount,
        config
    );
    const result: IconPickupResult = {
        stock: stockPayload,
        inventory,
        confirmed: {
            playerId: socketId,
            cityId: payload.cityId,
            itemType: payload.itemType,
            amount
        }
    };
    if (removedHazardId) {
        result.removedHazardId = removedHazardId;
    }

    return {
        ok: true,
        value: result
    };
};
