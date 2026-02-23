import type { Application } from "pixi.js";
import { Effect } from "effect";
import { logClient } from "../../observability/ClientLogger.js";

type EventSource = {
    addEventListener: (type: string, listener: () => void) => void;
    removeEventListener: (type: string, listener: () => void) => void;
};

type DocumentLike = {
    fullscreenElement: Element | null;
    documentElement: {
        requestFullscreen: () => Promise<void>;
    };
    exitFullscreen: () => Promise<void>;
};

export const syncRendererSize = (
    app: Application,
    width: number,
    height: number
): void => {
    const nextWidth = Math.max(1, Math.floor(width));
    const nextHeight = Math.max(1, Math.floor(height));
    app.renderer.resize(nextWidth, nextHeight);
};

export const toggleFullscreen = (documentLike: DocumentLike): Promise<void> => {
    if (documentLike.fullscreenElement) {
        return documentLike.exitFullscreen();
    }
    return documentLike.documentElement.requestFullscreen();
};

export const registerWindowModeHandlers = (
    app: Application,
    eventSource: EventSource | null = typeof window === "undefined" ? null : window,
    readViewport: (() => { width: number; height: number; }) | null = typeof window === "undefined"
        ? null
        : () => ({
            width: window.innerWidth,
            height: window.innerHeight
        }),
    documentLike: DocumentLike | null = typeof document === "undefined"
        ? null
        : {
            fullscreenElement: document.fullscreenElement,
            documentElement: document.documentElement,
            exitFullscreen: () => document.exitFullscreen()
        }
): (() => void) => {
    if (!eventSource) {
        return () => {
            // no-op in non-browser environments
        };
    }

    const onResize = (): void => {
        if (!readViewport) {
            return;
        }
        const viewport = readViewport();
        syncRendererSize(app, viewport.width, viewport.height);
    };

    const onToggleFullscreen = (): void => {
        if (!documentLike) {
            return;
        }
        const fullscreenElement = typeof document === "undefined"
            ? documentLike.fullscreenElement
            : document.fullscreenElement;
        Effect.runFork(
            Effect.tryPromise(() => toggleFullscreen({
                fullscreenElement,
                documentElement: documentLike.documentElement,
                exitFullscreen: documentLike.exitFullscreen
            })).pipe(
                Effect.catchAll(() => logClient("window.fullscreen.toggle_failed"))
            )
        );
    };

    eventSource.addEventListener("resize", onResize);
    eventSource.addEventListener("dblclick", onToggleFullscreen);

    return () => {
        eventSource.removeEventListener("resize", onResize);
        eventSource.removeEventListener("dblclick", onToggleFullscreen);
    };
};
