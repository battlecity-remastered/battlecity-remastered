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
    ITEM_TYPE_LASER,
    ITEM_TYPE_MINE,
    ITEM_TYPE_ORB,
    ITEM_TYPE_ROCKET,
    ITEM_TYPE_TURRET
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

test("inventory hotkeys support D for deploying selected defense item from inventory", () => {
    const state = createClientState();
    state.local.city = 4;
    state.local.x = 431;
    state.local.y = 527;
    state.inventory.set(ITEM_TYPE_TURRET, 1);
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
    assert.equal(sent[0]?.type, "defense.deploy.request");
    assert.deepEqual(sent[0]?.payload, {
        cityId: 4,
        type: ITEM_TYPE_TURRET,
        tileX: 9,
        tileY: 11,
        fromInventory: true
    });
});

test("inventory hotkeys support D for dropping selected non-hazard item as map icon", () => {
    const state = createClientState();
    state.local.city = 2;
    state.local.x = 336;
    state.local.y = 432;
    state.inventory.set(ITEM_TYPE_LASER, 1);
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
        cityId: 2,
        type: ITEM_TYPE_LASER,
        position: {
            x: 336,
            y: 432
        },
        armed: true
    });
});

test("inventory hotkeys support B for quick armed bomb drop", () => {
    const state = createClientState();
    state.local.city = 3;
    state.local.x = 240;
    state.local.y = 336;
    state.inventory.set(ITEM_TYPE_BOMB, 2);
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
        key: "b",
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
    assert.equal(state.ui.selectedInventoryItemType, ITEM_TYPE_BOMB);
    assert.equal(state.ui.bombArmed, true);
    assert.equal(sent.length, 1);
    assert.equal(sent[0]?.type, "hazard.deploy.request");
    assert.deepEqual(sent[0]?.payload, {
        cityId: 3,
        type: ITEM_TYPE_BOMB,
        position: {
            x: 240,
            y: 336
        },
        armed: true
    });
});

test("inventory hotkeys support O for front-strip orb drop payload", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 0;
    state.local.x = 95 * 48;
    state.local.y = (31 + 2) * 48;
    state.inventory.set(ITEM_TYPE_ORB, 1);
    state.cityFinance.set(1, {
        cash: 1,
        income: 1,
        score: 0,
        researchLevel: 0,
        isOrbable: true
    });
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
        key: "o",
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
    assert.equal(sent[0]?.type, "orb.drop.request");
    assert.deepEqual(sent[0]?.payload, {
        sourceCityId: 0,
        targetCityId: 1,
        position: {
            x: 95 * 48,
            y: (31 + 2) * 48
        }
    });
});

test("inventory hotkeys ignore Shift+O", () => {
    const state = createClientState();
    state.local.id = "p1";
    state.local.city = 0;
    state.local.x = 480;
    state.local.y = 480;
    state.inventory.set(ITEM_TYPE_ORB, 1);
    state.cityFinance.set(1, {
        cash: 1,
        income: 1,
        score: 0,
        researchLevel: 0,
        isOrbable: true
    });
    state.buildings.set("enemy-cc", {
        id: "enemy-cc",
        ownerId: "enemy",
        cityId: 1,
        type: 0,
        tileX: 14,
        tileY: 9,
        health: 120,
        maxHealth: 120,
        population: 0
    });
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

    const unregister = registerInventoryHotkeys(state, send);
    mockWindow.emit("keydown", {
        key: "O",
        shiftKey: true,
        preventDefault: () => {}
    } as KeyboardEvent as Event);

    unregister();
    Object.defineProperty(globalThis, "window", {
        configurable: true,
        writable: true,
        value: previousWindow
    });

    assert.equal(sent.length, 0);
});
