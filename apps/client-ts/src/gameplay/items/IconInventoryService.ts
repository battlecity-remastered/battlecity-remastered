import type { ClientState } from "../../app/state.js";
import type { EventSender } from "../../network/events.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_ORB,
    ITEM_TYPE_PLASMA,
    ITEM_TYPE_SLEEPER,
    ITEM_TYPE_TURRET,
    ITEM_TYPE_WALL,
    TILE
} from "../../render/parity/constants.js";
import { listCitySpawns } from "../../world/city-spawn.js";

type InventoryEntry = {
    itemType: number;
    count: number;
};

const DEFENSE_DROP_TYPES = new Set([ITEM_TYPE_WALL, ITEM_TYPE_TURRET, ITEM_TYPE_SLEEPER, ITEM_TYPE_PLASMA]);
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;

const isInteractiveTarget = (event: KeyboardEvent): boolean => {
    const target = event.target as Element | null;
    if (!target) {
        return false;
    }
    const tag = target.tagName?.toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") {
        return true;
    }
    return typeof HTMLElement !== "undefined"
        && target instanceof HTMLElement
        && target.isContentEditable;
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

const resolveOrbDropPosition = (state: ClientState): { x: number; y: number } => {
    const tileX = Math.floor((state.local.x + (TILE / 2)) / TILE);
    const tileY = Math.floor((state.local.y + (TILE / 2)) / TILE);
    return {
        x: tileX * TILE,
        y: tileY * TILE
    };
};

const resolveOrbDropPayload = (
    state: ClientState
): { sourceCityId: number; targetCityId: number; position: { x: number; y: number; }; } | null => {
    const position = resolveOrbDropPosition(state);
    const centerX = position.x + (TILE / 2);
    const centerY = position.y + (TILE / 2);
    let best: { cityId: number; distanceSq: number } | null = null;

    for (const spawn of listCitySpawns()) {
        if (spawn.cityId === state.local.city) {
            continue;
        }
        if (state.cityFinance.get(spawn.cityId)?.isOrbable !== true) {
            continue;
        }
        const rectX = spawn.tileX * TILE;
        const rectY = (spawn.tileY + COMMAND_CENTER_HEIGHT_TILES) * TILE;
        const rectWidth = COMMAND_CENTER_WIDTH_TILES * TILE;
        const rectHeight = TILE;
        const rectRight = rectX + rectWidth;
        const rectBottom = rectY + rectHeight;
        if (centerX < rectX || centerX > rectRight || centerY < rectY || centerY > rectBottom) {
            continue;
        }

        const clampedX = Math.max(rectX, Math.min(centerX, rectRight));
        const clampedY = Math.max(rectY, Math.min(centerY, rectBottom));
        const dx = centerX - clampedX;
        const dy = centerY - clampedY;
        const distanceSq = (dx * dx) + (dy * dy);
        if (!best || distanceSq < best.distanceSq) {
            best = { cityId: spawn.cityId, distanceSq };
        }
    }

    if (!best) {
        return null;
    }
    return {
        sourceCityId: state.local.city,
        targetCityId: best.cityId,
        position
    };
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

    if (selected === ITEM_TYPE_ORB) {
        const payload = resolveOrbDropPayload(state);
        if (!payload) {
            return false;
        }
        send("orb.drop.request", payload);
        return true;
    }
    if (DEFENSE_DROP_TYPES.has(selected)) {
        const tileX = Math.floor((state.local.x + (TILE / 2)) / TILE);
        const tileY = Math.floor((state.local.y + (TILE / 2)) / TILE);
        send("defense.deploy.request", {
            cityId: state.local.city,
            type: selected,
            tileX,
            tileY,
            fromInventory: true
        });
        return true;
    }

    // Legacy behavior: non-defense items are dropped on-map via hazard deploy.
    send("hazard.deploy.request", {
        cityId: state.local.city,
        type: selected,
        position: {
            x: state.local.x,
            y: state.local.y
        },
        armed: selected === ITEM_TYPE_BOMB ? state.ui.bombArmed : true
    });
    return true;
};

const dropOrbShortcut = (state: ClientState, send: EventSender): boolean => {
    const count = state.inventory.get(ITEM_TYPE_ORB) ?? 0;
    if (count <= 0) {
        return false;
    }
    const payload = resolveOrbDropPayload(state);
    if (!payload) {
        return false;
    }
    state.ui.selectedInventoryItemType = ITEM_TYPE_ORB;
    state.ui.bombArmed = false;
    send("orb.drop.request", payload);
    return true;
};

const dropArmedBombShortcut = (state: ClientState, send: EventSender): boolean => {
    const count = state.inventory.get(ITEM_TYPE_BOMB) ?? 0;
    if (count <= 0) {
        return false;
    }

    state.ui.selectedInventoryItemType = ITEM_TYPE_BOMB;
    state.ui.bombArmed = true;
    send("hazard.deploy.request", {
        cityId: state.local.city,
        type: ITEM_TYPE_BOMB,
        position: {
            x: state.local.x,
            y: state.local.y
        },
        armed: true
    });
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
    const hasModifiers = (event: KeyboardEvent): boolean => {
        return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
    };

    const onKeyDown = (event: KeyboardEvent): void => {
        if (isInteractiveTarget(event)) {
            return;
        }
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
        if (event.key === "d" || event.key === "D") {
            if (dropSelectedIcon(state, send)) {
                event.preventDefault();
            }
            return;
        }
        if (event.key === "o" || event.key === "O") {
            if (hasModifiers(event)) {
                return;
            }
            if (dropOrbShortcut(state, send)) {
                event.preventDefault();
            }
            return;
        }
        if (event.key === "b" || event.key === "B") {
            if (dropArmedBombShortcut(state, send)) {
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
