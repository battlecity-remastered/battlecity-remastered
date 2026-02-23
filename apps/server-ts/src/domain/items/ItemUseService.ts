import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeState } from "../../runtime/types.js";
import { consumeInventoryItem } from "../inventory/InventoryService.js";

const MEDKIT_ITEM_TYPE = 0;
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
    if (payload.itemType !== MEDKIT_ITEM_TYPE) {
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

    const health = Math.min(player.maxHealth, player.health + MEDKIT_HEAL_AMOUNT);
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
                source: "medkit"
            },
            inventory: consumed.value
        }
    };
};
