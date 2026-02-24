import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    registerMouseInputHandlers,
    resolveControlForMouseButton,
    resolveCursorForState,
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
    assert.equal(resolveControlForMouseButton(2), "useItem");
    assert.equal(resolveControlForMouseButton(1), null);
});

test("resolveCursorForState maps build/demolish/bomb modes", () => {
    const state = createClientState();
    assert.equal(resolveCursorForState(state), "default");
    state.ui.showBuildMenu = true;
    assert.equal(resolveCursorForState(state), "crosshair");
    state.ui.showBuildMenu = false;
    state.ui.bombArmed = true;
    assert.equal(resolveCursorForState(state), "cell");
    state.controls.demolish = true;
    assert.equal(resolveCursorForState(state), "not-allowed");
});

test("resolvePanelAction maps right-side panel hotspots", () => {
    assert.equal(resolvePanelAction(740, 270, 800), "toggle_staff");
    assert.equal(resolvePanelAction(740, 292, 800), "toggle_map");
    assert.equal(resolvePanelAction(740, 314, 800), "toggle_city_info");
    assert.equal(resolvePanelAction(740, 336, 800), "toggle_points");
    assert.equal(resolvePanelAction(740, 358, 800), "toggle_options");
    assert.equal(resolvePanelAction(740, 380, 800), "toggle_help");
    assert.equal(resolvePanelAction(726, 404, 800), "toggle_build");
    assert.equal(resolvePanelAction(744, 578, 800), "leave_lobby");
    assert.equal(resolvePanelAction(100, 80, 800), null);
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
        clientX: 620,
        clientY: 290
    } as MouseEvent as Event);
    assert.equal(state.ui.panelView, "staff");
    assert.equal(state.controls.shoot, false);

    surface.emit("mousedown", {
        button: 0,
        clientX: 620,
        clientY: 312
    } as MouseEvent as Event);
    assert.equal(state.ui.showMapModal, true);
    assert.equal(state.ui.panelView, "status");

    surface.emit("mousedown", {
        button: 0,
        clientX: 606,
        clientY: 424
    } as MouseEvent as Event);
    assert.equal(state.ui.showBuildMenu, true);
    assert.equal(surface.style.cursor, "crosshair");

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
    assert.equal(state.controls.useItem, true);
    surface.emit("mouseleave");
    assert.equal(state.controls.useItem, false);
    assert.equal(state.pointer.inside, false);

    surface.rect.width = 500;
    surface.rect.height = 300;
    windowSource.emit("resize");
    assert.equal(state.pointer.surfaceWidth, 500);
    assert.equal(state.pointer.surfaceHeight, 300);

    state.ui.showBuildMenu = true;
    surface.emit("mousedown", {
        button: 0,
        clientX: 200,
        clientY: 200
    } as MouseEvent as Event);
    assert.equal(state.controls.build, true);
    assert.equal(state.controls.ctrl, true);
    assert.equal(state.controls.shoot, false);
    assert.equal(surface.style.cursor, "crosshair");
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
    assert.equal(surface.style.cursor, "not-allowed");

    unregister();
    assert.equal(surface.style.cursor, "default");
});
