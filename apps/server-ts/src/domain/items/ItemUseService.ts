import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeState } from "../../runtime/types.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";

const CLOAK_ITEM_TYPE = 0;
const MEDKIT_ITEM_TYPE = 2;
const MEDKIT_HEAL_AMOUNT = 35;

export type ItemUseResult = {
    health: KnownEventPayloadByType["player.health"];
    inventory: KnownEventPayloadByType["inventory.update"];
};

export const useItem = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["item.use.request"]
): CommandResult<ItemUseResult> => {
    if (payload.itemType !== MEDKIT_ITEM_TYPE && payload.itemType !== CLOAK_ITEM_TYPE) {
        return rejectResult("hazard_invalid");
    }

    const player = state.players.get(socketId);
    if (!player) {
        return rejectResult("player_not_joined");
    }

    const consumed = consumeInventoryItem(state, socketId, payload.itemType);
    if (!consumed.ok) {
        return consumed;
    }

    const health = payload.itemType === MEDKIT_ITEM_TYPE
        ? Math.min(player.maxHealth, player.health + MEDKIT_HEAL_AMOUNT)
        : player.health;
    state.players.set(socketId, {
        ...player,
        health
    });

    return {
        ok: true,
        value: {
            health: {
                id: socketId,
                health,
                maxHealth: player.maxHealth,
                source: payload.itemType === MEDKIT_ITEM_TYPE ? "medkit" : "cloak"
            },
            inventory: consumed.value
        }
    };
};
