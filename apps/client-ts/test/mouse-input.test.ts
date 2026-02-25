import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    registerMouseInputHandlers,
    resolveControlForMouseButton,
    resolveCursorForState,
    resolvePanelInventoryItemType,
    resolvePanelAction,
    resolvePointerPosition
} from "../src/input/mouse-input.js";

class MockEventSource {
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

    public emit(type: string, event: Event = new Event(type)): void {
        const bucket = this.listeners.get(type);
        if (!bucket) {
            return;
        }
        for (const listener of bucket) {
            listener(event);
        }
    }
}

class MockSurface extends MockEventSource {
    public rect = {
        left: 40,
        top: 20,
        width: 640,
        height: 480
    };
    public style: { cursor?: string; } = {};

    public getBoundingClientRect(): {
        left: number;
        top: number;
        width: number;
        height: number;
    } {
        return this.rect;
    }
}

test("resolveControlForMouseButton maps left/right buttons to controls", () => {
    assert.equal(resolveControlForMouseButton(0), "shoot");
    assert.equal(resolveControlForMouseButton(2), null);
    assert.equal(resolveControlForMouseButton(1), null);
});

test("resolveCursorForState maps build/demolish/bomb modes", () => {
    const state = createClientState();
    assert.equal(resolveCursorForState(state), "default");
    state.ui.buildGhostMode = true;
    assert.equal(resolveCursorForState(state), "crosshair");
    state.ui.buildGhostMode = false;
    state.ui.showBuildMenu = true;
    assert.equal(resolveCursorForState(state), "default");
    state.ui.showBuildMenu = false;
    state.ui.bombArmed = true;
    assert.equal(resolveCursorForState(state), "cell");
    state.ui.buildDemolishMode = true;
    assert.equal(resolveCursorForState(state), "url('/assets/imgDemolish.png') 0 0, auto");
});

test("resolvePanelAction maps right-side panel hotspots", () => {
    assert.equal(resolvePanelAction(746, 270, 800), "toggle_staff");
    assert.equal(resolvePanelAction(746, 292, 800), "toggle_map");
    assert.equal(resolvePanelAction(746, 314, 800), "toggle_city_info");
    assert.equal(resolvePanelAction(746, 336, 800), "toggle_points");
    assert.equal(resolvePanelAction(746, 358, 800), "toggle_options");
    assert.equal(resolvePanelAction(746, 380, 800), "toggle_help");
    assert.equal(resolvePanelAction(726, 404, 800), "toggle_build");
    assert.equal(resolvePanelAction(750, 578, 800), "leave_lobby");
    assert.equal(resolvePanelAction(100, 80, 800), null);
});

test("resolvePanelInventoryItemType maps panel inventory slot grid", () => {
    assert.equal(resolvePanelInventoryItemType(610, 267, 800), 12);
    assert.equal(resolvePanelInventoryItemType(645, 267, 800), 1);
    assert.equal(resolvePanelInventoryItemType(680, 267, 800), 2);
    assert.equal(resolvePanelInventoryItemType(100, 100, 800), null);
});

test("resolvePanelInventoryItemType prefers owned item for overlapping slots", () => {
    const inventory = new Map<number, number>();
    inventory.set(9, 2);
    inventory.set(0, 0);
    assert.equal(resolvePanelInventoryItemType(610, 372, 800, inventory), 9);
});

test("resolvePointerPosition clamps coordinates and tracks inside state", () => {
    const inside = resolvePointerPosition(80, 40, {
        left: 40,
        top: 20,
        width: 100,
        height: 60
    });
    assert.equal(inside.x, 40);
    assert.equal(inside.y, 20);
    assert.equal(inside.inside, true);

    const outside = resolvePointerPosition(10, 500, {
        left: 40,
        top: 20,
        width: 100,
        height: 60
    });
    assert.equal(outside.x, 0);
    assert.equal(outside.y, 60);
    assert.equal(outside.inside, false);
});

test("registerMouseInputHandlers updates controls, pointer, and resize metrics", () => {
    const state = createClientState();
    state.local.id = "mayor-1";
    state.local.city = 2;
    state.lobby.assignments = [{ city: 2, mayorId: "mayor-1", recruitCount: 1 }];
    state.inventory.set(12, 1);
    state.inventory.set(1, 2);
    const surface = new MockSurface();
    const windowSource = new MockEventSource();
    const unregister = registerMouseInputHandlers(state, surface, windowSource);
    assert.equal(surface.style.cursor, "default");

    surface.emit("mousedown", {
        button: 0
    } as MouseEvent as Event);
    assert.equal(state.controls.shoot, true);

    surface.emit("mousemove", {
        clientX: 240,
        clientY: 220
    } as MouseEvent as Event);
    assert.equal(state.pointer.x, 200);
    assert.equal(state.pointer.y, 200);
    assert.equal(state.pointer.inside, true);

    surface.emit("mouseup", {
        button: 0
    } as MouseEvent as Event);
    assert.equal(state.controls.shoot, false);

    surface.emit("mousedown", {
        button: 0,
        clientX: 625,
        clientY: 290
    } as MouseEvent as Event);
    assert.equal(state.ui.panelView, "staff");
    assert.equal(state.controls.shoot, false);

    surface.emit("mousedown", {
        button: 0,
        clientX: 625,
        clientY: 312
    } as MouseEvent as Event);
    assert.equal(state.ui.showMapModal, true);
    assert.equal(state.ui.panelView, "status");

    surface.emit("mousedown", {
        button: 0,
        clientX: 530,
        clientY: 289
    } as MouseEvent as Event);
    assert.equal(state.ui.selectedInventoryItemType, 1);
    assert.equal(state.controls.shoot, false);

    surface.emit("mousedown", {
        button: 0,
        clientX: 606,
        clientY: 424
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, true);
    assert.equal(surface.style.cursor, "default");

    surface.emit("mousedown", {
        button: 0,
        clientX: 606,
        clientY: 424
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, false);
    assert.equal(surface.style.cursor, "default");

    surface.emit("mousedown", {
        button: 2
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, true);
    assert.equal(state.controls.useItem, false);
    surface.emit("mousedown", {
        button: 2
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, false);
    surface.emit("mouseleave");
    assert.equal(state.controls.useItem, false);
    assert.equal(state.pointer.inside, false);

    surface.rect.width = 500;
    surface.rect.height = 300;
    windowSource.emit("resize");
    assert.equal(state.pointer.surfaceWidth, 500);
    assert.equal(state.pointer.surfaceHeight, 300);

    state.ui.showBuildMenu = true;
    state.ui.buildGhostMode = true;
    surface.emit("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 200
    } as MouseEvent as Event);
    assert.equal(state.controls.build, false);
    assert.equal(state.controls.ctrl, false);
    assert.equal(state.controls.shoot, false);
    assert.equal(state.ui.buildGhostMode, false);
    assert.ok(state.ui.pendingBuildPlacement);
    surface.emit("mouseup", {
        button: 0
    } as MouseEvent as Event);
    assert.equal(state.controls.build, false);
    assert.equal(state.controls.ctrl, false);

    state.ui.showBuildMenu = false;
    state.ui.bombArmed = true;
    surface.emit("mousemove", {
        clientX: 240,
        clientY: 220
    } as MouseEvent as Event);
    assert.equal(surface.style.cursor, "cell");

    state.controls.demolish = true;
    surface.emit("mousemove", {
        clientX: 240,
        clientY: 220
    } as MouseEvent as Event);
    assert.equal(surface.style.cursor, "url('/assets/imgDemolish.png') 0 0, auto");

    unregister();
    assert.equal(surface.style.cursor, "default");
});

test("right click build toggle is ignored when local player is not mayor", () => {
    const state = createClientState();
    state.local.id = "recruit-1";
    state.local.city = 4;
    state.lobby.assignments = [{ city: 4, mayorId: "mayor-4", recruitCount: 2 }];
    const surface = new MockSurface();
    const windowSource = new MockEventSource();
    const unregister = registerMouseInputHandlers(state, surface, windowSource);

    surface.emit("mousedown", {
        button: 2
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, false);

    unregister();
});

test("clicking selected bomb inventory slot toggles armed state", () => {
    const state = createClientState();
    state.local.id = "mayor-bomb";
    state.local.city = 1;
    state.lobby.assignments = [{ city: 1, mayorId: "mayor-bomb", recruitCount: 0 }];
    state.inventory.set(3, 2);

    const surface = new MockSurface();
    const windowSource = new MockEventSource();
    const unregister = registerMouseInputHandlers(state, surface, windowSource);

    surface.emit("mousedown", {
        button: 0,
        clientX: 488,
        clientY: 323
    } as MouseEvent as Event);
    assert.equal(state.ui.selectedInventoryItemType, 3);
    assert.equal(state.ui.bombArmed, false);

    surface.emit("mousedown", {
        button: 0,
        clientX: 488,
        clientY: 323
    } as MouseEvent as Event);
    assert.equal(state.ui.selectedInventoryItemType, 3);
    assert.equal(state.ui.bombArmed, true);

    unregister();
});
