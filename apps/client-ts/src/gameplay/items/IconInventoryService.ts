import type { ClientState } from "../../app/state.js";
import { isCommandCenterType } from "@battlecity/sim-core";
import { isInteractiveKeyboardTarget } from "../../input/interactive-target.js";
import type { EventSender } from "../../network/events.js";
import { registerKeydownHandler } from "../../ui/hotkeys/register-keydown-handler.js";
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
import {
    resolveHazardDropPlacement,
    resolvePlayerDominantTile
} from "./drop-placement.js";

type InventoryEntry = {
    itemType: number;
    count: number;
};

const DEFENSE_DROP_TYPES = new Set([ITEM_TYPE_WALL, ITEM_TYPE_TURRET, ITEM_TYPE_SLEEPER, ITEM_TYPE_PLASMA]);
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;

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

const canOrbTargetCity = (state: ClientState, cityId: number): boolean => {
    const orbableFlag = state.cityFinance.get(cityId)?.isOrbable;
    if (orbableFlag === false) {
        return false;
    }
    if (orbableFlag === true) {
        return true;
    }
    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId) {
            continue;
        }
        if (isCommandCenterType(building.type) || building.type === 200 || building.type === 201) {
            return true;
        }
    }
    return false;
};

const resolveOrbDistanceSq = (
    centerX: number,
    centerY: number,
    spawn: ReturnType<typeof listCitySpawns>[number]
): number | null => {
    const rectX = spawn.tileX * TILE;
    const rectY = (spawn.tileY + COMMAND_CENTER_HEIGHT_TILES) * TILE;
    const rectWidth = COMMAND_CENTER_WIDTH_TILES * TILE;
    const rectHeight = TILE;
    const rectRight = rectX + rectWidth;
    const rectBottom = rectY + rectHeight;
    if (centerX < rectX || centerX > rectRight || centerY < rectY || centerY > rectBottom) {
        return null;
    }

    const clampedX = Math.max(rectX, Math.min(centerX, rectRight));
    const clampedY = Math.max(rectY, Math.min(centerY, rectBottom));
    const dx = centerX - clampedX;
    const dy = centerY - clampedY;
    return (dx * dx) + (dy * dy);
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
        if (!canOrbTargetCity(state, spawn.cityId)) {
            continue;
        }
        const distanceSq = resolveOrbDistanceSq(centerX, centerY, spawn);
        if (distanceSq === null) {
            continue;
        }
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
        const dominantTile = resolvePlayerDominantTile(state);
        send("defense.deploy.request", {
            cityId: state.local.city,
            type: selected,
            tileX: dominantTile.tileX,
            tileY: dominantTile.tileY,
            fromInventory: true
        });
        return true;
    }

    // Classic behavior: non-defense items are dropped on-map via hazard deploy,
    // snapped to the player's dominant tile and blocked by local collision guards.
    const placement = resolveHazardDropPlacement(state);
    if (!placement) {
        return false;
    }
    send("hazard.deploy.request", {
        cityId: state.local.city,
        type: selected,
        position: {
            x: placement.x,
            y: placement.y
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
    const placement = resolveHazardDropPlacement(state);
    if (!placement) {
        return false;
    }
    send("hazard.deploy.request", {
        cityId: state.local.city,
        type: ITEM_TYPE_BOMB,
        position: {
            x: placement.x,
            y: placement.y
        },
        armed: true
    });
    return true;
};

const hasHotkeyModifiers = (event: KeyboardEvent): boolean => {
    return event.shiftKey || event.ctrlKey || event.altKey || event.metaKey;
};

const handleInventoryHotkey = (
    state: ClientState,
    send: EventSender,
    event: KeyboardEvent
): boolean => {
    const key = event.key.toLowerCase();
    switch (key) {
        case "q":
            cycleInventorySelection(state, -1);
            return true;
        case "e":
            cycleInventorySelection(state, 1);
            return true;
        case "v":
            return toggleBombArming(state);
        case "d":
            return dropSelectedIcon(state, send);
        case "o":
            return !hasHotkeyModifiers(event) && dropOrbShortcut(state, send);
        case "b":
            return dropArmedBombShortcut(state, send);
        case "x":
            return event.shiftKey && dropSelectedIcon(state, send);
        default:
            return false;
    }
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
    return registerKeydownHandler((event) => {
        if (isInteractiveKeyboardTarget(event)) {
            return false;
        }
        return handleInventoryHotkey(state, send, event);
    });
};
