import type { Application } from "pixi.js";

type EventSource = {
    addEventListener: (type: string, listener: (event?: unknown) => void) => void;
    removeEventListener: (type: string, listener: (event?: unknown) => void) => void;
};

type DocumentLike = {
    fullscreenElement: Element | null;
    documentElement: {
        requestFullscreen: () => Promise<void>;
    };
    exitFullscreen: () => Promise<void>;
};

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
    _documentLike: DocumentLike | null = null
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

    const resolveDocumentLike = (): DocumentLike | null => {
        if (_documentLike) {
            return _documentLike;
        }
        if (typeof document === "undefined") {
            return null;
        }
        return {
            fullscreenElement: document.fullscreenElement,
            documentElement: document.documentElement,
            exitFullscreen: () => document.exitFullscreen()
        };
    };

    const onKeyDown = (rawEvent?: unknown): void => {
        const event = rawEvent as KeyboardEvent | undefined;
        if (!event || (event.key !== "f" && event.key !== "F")) {
            return;
        }
        if (event.ctrlKey || event.altKey || event.metaKey || isInteractiveTarget(event)) {
            return;
        }
        const documentLike = resolveDocumentLike();
        if (!documentLike) {
            return;
        }
        event.preventDefault();
        void toggleFullscreen(documentLike);
    };

    eventSource.addEventListener("resize", onResize);
    eventSource.addEventListener("keydown", onKeyDown);

    return () => {
        eventSource.removeEventListener("resize", onResize);
        eventSource.removeEventListener("keydown", onKeyDown);
    };
};
