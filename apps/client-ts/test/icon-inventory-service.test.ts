import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import type { EventSender } from "../src/network/events.js";
import {
    buildInventoryHudLines,
    cycleInventorySelection,
    onInventoryUpdate,
    registerInventoryHotkeys,
    toggleBombArming
} from "../src/gameplay/items/IconInventoryService.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ROCKET
} from "../src/render/parity/constants.js";

class MockWindow {
    private readonly listeners = new Map<string, Set<(event: Event) => void>>();

    public addEventListener(type: string, listener: (event: Event) => void): void {
        const bucket = this.listeners.get(type) ?? new Set();
        bucket.add(listener);
        this.listeners.set(type, bucket);
    }

    public removeEventListener(type: string, listener: (event: Event) => void): void {
        const bucket = this.listeners.get(type);
        if (!bucket) {
            return;
        }
        bucket.delete(listener);
    }

    public emit(type: string, event: Event): void {
        const bucket = this.listeners.get(type);
        if (!bucket) {
            return;
        }
        for (const listener of bucket) {
            listener(event);
        }
    }
}

test("inventory update picks first available item as selected", () => {
    const state = createClientState();
    state.inventory.set(ITEM_TYPE_BOMB, 1);
    state.inventory.set(ITEM_TYPE_ROCKET, 2);

    onInventoryUpdate(state);

    assert.equal(state.ui.selectedInventoryItemType, ITEM_TYPE_ROCKET);
    assert.equal(state.ui.bombArmed, false);
});

test("inventory selection cycles and resets bomb arming", () => {
    const state = createClientState();
    state.inventory.set(ITEM_TYPE_BOMB, 2);
    state.inventory.set(ITEM_TYPE_MINE, 1);
    onInventoryUpdate(state);

    assert.equal(toggleBombArming(state), true);
    assert.equal(state.ui.bombArmed, true);

    cycleInventorySelection(state, 1);

    assert.equal(state.ui.selectedInventoryItemType, ITEM_TYPE_MINE);
    assert.equal(state.ui.bombArmed, false);
});

test("inventory hud lines include selected marker and bomb status", () => {
    const state = createClientState();
    state.inventory.set(ITEM_TYPE_BOMB, 3);
    onInventoryUpdate(state);
    toggleBombArming(state);

    const lines = buildInventoryHudLines(state);

    assert.equal(lines[0]?.includes("*Item 3: 3 (armed)"), true);
});

test("inventory hotkeys support D for dropping selected item", () => {
    const state = createClientState();
    state.local.city = 6;
    state.local.x = 432;
    state.local.y = 528;
    state.inventory.set(ITEM_TYPE_MINE, 2);
    onInventoryUpdate(state);

    const sent: Array<{ type: string; payload: unknown; }> = [];
    const send: EventSender = (type, payload): void => {
        sent.push({ type: String(type), payload });
    };
    const mockWindow = new MockWindow();
    const previousWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: mockWindow
    });

    let prevented = false;
    const unregister = registerInventoryHotkeys(state, send);
    mockWindow.emit("keydown", {
        key: "d",
        preventDefault: () => {
            prevented = true;
        }
    } as KeyboardEvent as Event);

    unregister();
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow
    });

    assert.equal(prevented, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.type, "hazard.deploy.request");
    assert.deepEqual(sent[0]?.payload, {
        cityId: 6,
        type: ITEM_TYPE_MINE,
        position: {
            x: 432,
            y: 528
        },
        armed: true
    });
    assert.equal(state.inventory.get(ITEM_TYPE_MINE), 2);
});
