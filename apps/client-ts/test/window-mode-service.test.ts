import test from "node:test";
import assert from "node:assert/strict";
import {
    registerWindowModeHandlers,
    syncRendererSize,
    toggleFullscreen
} from "../src/ui/window/WindowModeService.js";

class MockEventSource {
    private readonly listeners = new Map<string, Set<(event?: unknown) => void>>();

    public addEventListener(type: string, listener: (event?: unknown) => void): void {
        const bucket = this.listeners.get(type) ?? new Set();
        bucket.add(listener);
        this.listeners.set(type, bucket);
    }

    public removeEventListener(type: string, listener: (event?: unknown) => void): void {
        const bucket = this.listeners.get(type);
        if (!bucket) {
            return;
        }
        bucket.delete(listener);
    }

    public emit(type: string, event?: unknown): void {
        const bucket = this.listeners.get(type);
        if (!bucket) {
            return;
        }
        for (const listener of bucket) {
            listener(event);
        }
    }
}

test("syncRendererSize clamps to positive integer dimensions", () => {
    const sizes: Array<{ width: number; height: number }> = [];
    const app = {
        renderer: {
            resize: (width: number, height: number) => {
                sizes.push({ width, height });
            }
        }
    };

    syncRendererSize(app as never, 0.4, -12);

    assert.deepEqual(sizes, [{ width: 1, height: 1 }]);
});

test("toggleFullscreen requests or exits based on state", async () => {
    const calls: string[] = [];
    await toggleFullscreen({
        fullscreenElement: null,
        documentElement: {
            requestFullscreen: async () => {
                calls.push("request");
            }
        },
        exitFullscreen: async () => {
            calls.push("exit");
        }
    });
    await toggleFullscreen({
        fullscreenElement: {} as Element,
        documentElement: {
            requestFullscreen: async () => {
                calls.push("request");
            }
        },
        exitFullscreen: async () => {
            calls.push("exit");
        }
    });

    assert.deepEqual(calls, ["request", "exit"]);
});

test("registerWindowModeHandlers binds resize updates", () => {
    const sizes: Array<{ width: number; height: number }> = [];
    const app = {
        renderer: {
            resize: (width: number, height: number) => {
                sizes.push({ width, height });
            }
        }
    };
    const eventSource = new MockEventSource();
    const unregister = registerWindowModeHandlers(
        app as never,
        eventSource,
        () => ({ width: 1280, height: 720 })
    );

    eventSource.emit("resize");

    assert.deepEqual(sizes, [{ width: 1280, height: 720 }]);

    unregister();
});

test("registerWindowModeHandlers toggles fullscreen on F key", () => {
    const app = {
        renderer: {
            resize: () => {}
        }
    };
    const eventSource = new MockEventSource();
    const requests: string[] = [];
    const unregister = registerWindowModeHandlers(
        app as never,
        eventSource,
        () => ({ width: 1280, height: 720 }),
        {
            fullscreenElement: null,
            documentElement: {
                requestFullscreen: async () => {
                    requests.push("request");
                }
            },
            exitFullscreen: async () => {
                requests.push("exit");
            }
        }
    );

    eventSource.emit("keydown", {
        key: "f",
        ctrlKey: false,
        altKey: false,
        metaKey: false,
        target: null,
        preventDefault: () => {}
    });

    assert.deepEqual(requests, ["request"]);
    unregister();
});
