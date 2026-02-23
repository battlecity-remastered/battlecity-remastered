import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import {
    registerMouseInputHandlers,
    resolveControlForMouseButton,
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

    unregister();
});
