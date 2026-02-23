import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";

const ensureInventory = (state: RuntimeState, playerId: string): Map<number, number> => {
    const existing = state.playerInventory.get(playerId);
    if (existing) {
        return existing;
    }
    const created = new Map<number, number>();
    state.playerInventory.set(playerId, created);
    return created;
};

const toPayload = (state: RuntimeState, playerId: string): KnownEventPayloadByType["inventory.update"] => {
    const inventory = ensureInventory(state, playerId);
    const items = Array.from(inventory.entries()).map(([itemType, count]) => {
        return { itemType, count };
    });
    return {
        playerId,
        items
    };
};

export const addInventoryItem = (
    state: RuntimeState,
    playerId: string,
    itemType: number,
    amount: number,
    config: RuntimeConfig
): KnownEventPayloadByType["inventory.update"] => {
    const inventory = ensureInventory(state, playerId);
    const current = inventory.get(itemType) ?? 0;
    const next = Math.min(config.inventoryPerItemCap, current + Math.max(1, Math.floor(amount)));
    inventory.set(itemType, next);
    state.playerInventory.set(playerId, inventory);
    return toPayload(state, playerId);
};

export const consumeInventoryItem = (
    state: RuntimeState,
    playerId: string,
    itemType: number
): CommandResult<KnownEventPayloadByType["inventory.update"]> => {
    const inventory = ensureInventory(state, playerId);
    const current = inventory.get(itemType) ?? 0;
    if (current <= 0) {
        return rejectResult("inventory_empty");
    }

    const next = current - 1;
    if (next > 0) {
        inventory.set(itemType, next);
    } else {
        inventory.delete(itemType);
    }
    state.playerInventory.set(playerId, inventory);
    return { ok: true, value: toPayload(state, playerId) };
};

export const releasePlayerInventory = (state: RuntimeState, playerId: string): void => {
    state.playerInventory.delete(playerId);
};

export const emitInventoryState = (
    state: RuntimeState,
    playerId: string
): KnownEventPayloadByType["inventory.update"] => {
    return toPayload(state, playerId);
};
