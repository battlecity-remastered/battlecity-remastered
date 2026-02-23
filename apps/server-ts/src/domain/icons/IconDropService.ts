import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { type CommandResult } from "../../runtime/types.js";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { collectFactoryStock } from "../factories/FactoryService.js";
import { addInventoryItem } from "../inventory/InventoryService.js";

export type IconPickupResult = {
    stock: KnownEventPayloadByType["factory.stock"];
    inventory: KnownEventPayloadByType["inventory.update"];
    confirmed: KnownEventPayloadByType["icon.pickup.confirmed"];
};

export const pickupIcon = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["icon.pickup.request"],
    config: RuntimeConfig
): CommandResult<IconPickupResult> => {
    const stock = collectFactoryStock(state, payload.cityId, payload.itemType, payload.amount ?? 1);
    if (!stock.ok) {
        return stock;
    }

    const inventory = addInventoryItem(
        state,
        socketId,
        payload.itemType,
        payload.amount ?? 1,
        config
    );
    return {
        ok: true,
        value: {
            stock: stock.value,
            inventory,
            confirmed: {
                playerId: socketId,
                cityId: payload.cityId,
                itemType: payload.itemType,
                amount: payload.amount ?? 1
            }
        }
    };
};
