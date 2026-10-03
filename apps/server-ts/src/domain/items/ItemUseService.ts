import { CLASSIC_CLOAK_MS } from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeState, type RuntimePlayer } from "../../runtime/types.js";
import { consumeInventoryItem, emitInventoryState } from "../inventory/InventoryService.js";

const CLOAK_ITEM_TYPE = 0;
const MEDKIT_ITEM_TYPE = 2;

export type ItemUseResult = {
    health: KnownEventPayloadByType["player.health"];
    inventory: KnownEventPayloadByType["inventory.update"];
};

const isFullHealthMedkit = (type: number, player: RuntimePlayer): boolean => type === MEDKIT_ITEM_TYPE && player.health >= player.maxHealth;

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

    if (isFullHealthMedkit(payload.itemType, player)) return {
        ok: true, value: {
            health: { id: socketId, health: player.health, maxHealth: player.maxHealth, source: "medkit" },
            inventory: emitInventoryState(state, socketId)
        }
    };

    const consumed = consumeInventoryItem(state, socketId, payload.itemType);
    if (!consumed.ok) {
        return consumed;
    }

    const health = payload.itemType === MEDKIT_ITEM_TYPE
        ? player.maxHealth
        : player.health;
    state.players.set(socketId, {
        ...player,
        health,
        ...(payload.itemType===CLOAK_ITEM_TYPE?{cloakedUntil:Date.now()+CLASSIC_CLOAK_MS}:{})
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
