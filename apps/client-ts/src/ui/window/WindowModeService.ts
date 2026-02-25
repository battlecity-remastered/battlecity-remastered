import type { Application } from "pixi.js";

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
    _documentLike: DocumentLike | null = typeof document === "undefined"
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

    eventSource.addEventListener("resize", onResize);

    return () => {
        eventSource.removeEventListener("resize", onResize);
    };
};
