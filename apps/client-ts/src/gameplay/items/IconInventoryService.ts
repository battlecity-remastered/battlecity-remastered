import type { ClientState } from "../../app/state.js";
import type { EventSender } from "../../network/events.js";
import { ITEM_TYPE_BOMB } from "../../render/parity/constants.js";

type InventoryEntry = {
    itemType: number;
    count: number;
};

const sortedInventoryEntries = (state: ClientState): InventoryEntry[] => {
    return [...state.inventory.entries()]
        .map(([itemType, count]) => ({ itemType, count }))
        .filter((entry) => entry.count > 0)
        .sort((left, right) => left.itemType - right.itemType);
};

const ensureSelectedItem = (state: ClientState): void => {
    const entries = sortedInventoryEntries(state);
    if (entries.length === 0) {
        state.ui.selectedInventoryItemType = null;
        state.ui.bombArmed = false;
        return;
    }
    const selected = state.ui.selectedInventoryItemType;
    if (selected !== null && entries.some((entry) => entry.itemType === selected)) {
        return;
    }
    state.ui.selectedInventoryItemType = entries[0]?.itemType ?? null;
    state.ui.bombArmed = false;
};

export const onInventoryUpdate = (state: ClientState): void => {
    ensureSelectedItem(state);
};

export const cycleInventorySelection = (state: ClientState, direction: 1 | -1): void => {
    const entries = sortedInventoryEntries(state);
    if (entries.length === 0) {
        state.ui.selectedInventoryItemType = null;
        state.ui.bombArmed = false;
        return;
    }

    const currentType = state.ui.selectedInventoryItemType;
    const currentIndex = entries.findIndex((entry) => entry.itemType === currentType);
    const nextIndex = currentIndex < 0
        ? 0
        : (currentIndex + direction + entries.length) % entries.length;

    state.ui.selectedInventoryItemType = entries[nextIndex]?.itemType ?? entries[0]?.itemType ?? null;
    state.ui.bombArmed = false;
};

export const toggleBombArming = (state: ClientState): boolean => {
    ensureSelectedItem(state);
    if (state.ui.selectedInventoryItemType !== ITEM_TYPE_BOMB) {
        return false;
    }
    state.ui.bombArmed = !state.ui.bombArmed;
    return true;
};

const dropSelectedIcon = (state: ClientState, send: EventSender): boolean => {
    ensureSelectedItem(state);
    const selected = state.ui.selectedInventoryItemType;
    if (selected === null) {
        return false;
    }
    const count = state.inventory.get(selected) ?? 0;
    if (count <= 0) {
        return false;
    }

    send("icon:drop", {
        itemType: selected,
        cityId: state.local.city,
        x: state.local.x,
        y: state.local.y
    });
    state.inventory.set(selected, count - 1);
    ensureSelectedItem(state);
    return true;
};

export const buildInventoryHudLines = (state: ClientState): string[] => {
    ensureSelectedItem(state);
    const entries = sortedInventoryEntries(state);
    if (entries.length === 0) {
        return ["Inventory: empty"];
    }

    const selected = state.ui.selectedInventoryItemType;
    return entries.slice(0, 6).map((entry) => {
        const marker = entry.itemType === selected ? "*" : " ";
        const bombState = entry.itemType === ITEM_TYPE_BOMB && state.ui.bombArmed ? " (armed)" : "";
        return `${marker}Item ${entry.itemType}: ${entry.count}${bombState}`;
    });
};

export const registerInventoryHotkeys = (
    state: ClientState,
    send: EventSender
): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "q" || event.key === "Q") {
            cycleInventorySelection(state, -1);
            event.preventDefault();
            return;
        }
        if (event.key === "e" || event.key === "E") {
            cycleInventorySelection(state, 1);
            event.preventDefault();
            return;
        }
        if (event.key === "v" || event.key === "V") {
            if (toggleBombArming(state)) {
                event.preventDefault();
            }
            return;
        }
        if (event.key === "x" || event.key === "X") {
            if (event.shiftKey && dropSelectedIcon(state, send)) {
                event.preventDefault();
            }
        }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
};
