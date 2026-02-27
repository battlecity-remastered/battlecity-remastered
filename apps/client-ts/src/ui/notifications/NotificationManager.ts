import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";
import {
    buildNotificationLines,
    collectNotificationEvents,
    type NotificationCursor,
    type NotificationItem
} from "./notification-events.js";

const MAX_VISIBLE = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const EXIT_ANIMATION_MS = 180;

type NotificationManager = {
    render: () => void;
    dispose: () => void;
};

const ensureStyles = (): void => {
    if (typeof document === "undefined" || document.getElementById("battlecity-toast-styles")) {
        return;
    }
    const style = document.createElement("style");
    style.id = "battlecity-toast-styles";
    style.textContent = `
        #battlecity-toast-container {
            position: fixed;
            inset: auto 24px 24px auto;
            display: flex;
            flex-direction: column;
            justify-content: flex-end;
            gap: 12px;
            width: min(340px, 92vw);
            z-index: 1200;
            pointer-events: none;
        }
        .battlecity-toast {
            background: rgba(16, 20, 32, 0.92);
            border-radius: 12px;
            border: 1px solid rgba(82, 104, 176, 0.35);
            box-shadow: 0 18px 40px rgba(5, 9, 20, 0.55);
            padding: 12px 16px 12px 18px;
            display: flex;
            flex-direction: column;
            gap: 6px;
            font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
            color: #ecf2ff;
            pointer-events: auto;
            cursor: pointer;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 160ms ease, transform 160ms ease;
        }
        .battlecity-toast[data-visible="true"] {
            opacity: 1;
            transform: translateY(0);
        }
        .battlecity-toast__title {
            font-weight: 600;
            letter-spacing: 0.3px;
            font-size: 14px;
        }
        .battlecity-toast__body {
            font-size: 13px;
            line-height: 1.45;
            opacity: 0.9;
        }
        .battlecity-toast[data-variant="success"] { border-color: rgba(82, 176, 125, 0.5); }
        .battlecity-toast[data-variant="warn"] { border-color: rgba(220, 156, 72, 0.5); }
        .battlecity-toast[data-variant="error"] { border-color: rgba(220, 92, 92, 0.5); }
    `;
    document.head.appendChild(style);
};

const createContainer = (root: HTMLElement): HTMLDivElement => {
    const existing = document.getElementById("battlecity-toast-container");
    if (existing && existing instanceof HTMLDivElement) {
        return existing;
    }
    const container = document.createElement("div");
    container.id = "battlecity-toast-container";
    const gameContainer = document.getElementById("game");
    (gameContainer ?? root).appendChild(container);
    return container;
};

const createCursor = (): NotificationCursor => {
    return {
        promotionCount: 0,
        lastBuildDeniedReason: null,
        lastDemolishDeniedReason: null,
        lastOrbedCityId: null,
        lastPlayerDeadSignature: null,
        lastRejectedReason: null,
        lastPickupSignature: null,
        lastChatRateLimitSignature: null
    };
};

const trackRemoteJoins = (
    state: ClientState,
    knownRemotePlayerIds: Set<string>,
    seeded: boolean,
    queue: NotificationItem[]
): boolean => {
    if (!seeded) {
        for (const id of state.remotePlayers.keys()) {
            knownRemotePlayerIds.add(id);
        }
        return true;
    }

    for (const id of [...knownRemotePlayerIds]) {
        if (!state.remotePlayers.has(id)) {
            knownRemotePlayerIds.delete(id);
        }
    }

    for (const [id, remote] of state.remotePlayers.entries()) {
        if (knownRemotePlayerIds.has(id)) {
            continue;
        }
        knownRemotePlayerIds.add(id);
        if (remote.city < 0 || id.startsWith("rogue_")) {
            continue;
        }
        queue.push({
            id: `${Date.now()}:${Math.random()}`,
            text: `Player joined: ${id} joined in ${getCityDisplayName(remote.city)}.`,
            title: "Player joined",
            body: `${id} joined in ${getCityDisplayName(remote.city)}.`,
            variant: "info",
            timeoutMs: 4200,
            createdAt: Date.now()
        });
    }
    return true;
};

const createToast = (item: NotificationItem): HTMLDivElement => {
    const toast = document.createElement("div");
    toast.className = "battlecity-toast";
    toast.dataset.variant = item.variant;
    if (item.title) {
        const title = document.createElement("div");
        title.className = "battlecity-toast__title";
        title.textContent = item.title;
        toast.appendChild(title);
    }
    if (item.body) {
        const body = document.createElement("div");
        body.className = "battlecity-toast__body";
        body.textContent = item.body;
        toast.appendChild(body);
    }
    return toast;
};

export { collectNotificationEvents, buildNotificationLines };

export const createNotificationManager = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): NotificationManager => {
    if (!root || typeof document === "undefined") {
        return { render: () => {}, dispose: () => {} };
    }

    ensureStyles();
    const container = createContainer(root);
    const queue: NotificationItem[] = [];
    const activeToasts = new Set<HTMLDivElement>();
    const toastTimeouts = new WeakMap<HTMLDivElement, number>();
    const renderedNoticeIds = new Set<string>();
    const renderedNoticeOrder: string[] = [];
    const knownRemotePlayerIds = new Set<string>();
    let hasSeededRemotePlayerIds = false;
    let cursor = createCursor();

    const dismissToast = (toast: HTMLDivElement): void => {
        if (!activeToasts.has(toast)) {
            return;
        }
        activeToasts.delete(toast);
        toast.dataset.visible = "false";
        const timeoutHandle = toastTimeouts.get(toast);
        if (typeof timeoutHandle === "number") {
            window.clearTimeout(timeoutHandle);
        }
        window.setTimeout(() => {
            toast.remove();
        }, EXIT_ANIMATION_MS);
    };

    const pushToast = (item: NotificationItem): void => {
        while (activeToasts.size >= MAX_VISIBLE) {
            const oldest = activeToasts.values().next().value;
            if (!oldest) {
                break;
            }
            dismissToast(oldest);
        }
        const toast = createToast(item);
        toast.addEventListener("click", () => dismissToast(toast));
        container.appendChild(toast);
        activeToasts.add(toast);
        requestAnimationFrame(() => {
            toast.dataset.visible = "true";
        });
        toastTimeouts.set(toast, window.setTimeout(() => dismissToast(toast), item.timeoutMs || DEFAULT_TIMEOUT_MS));
    };

    return {
        render: () => {
            container.style.display = state.ui.showIntroModal ? "none" : "flex";
            container.style.opacity = String(state.ui.overlaysOpacity);
            cursor = collectNotificationEvents(state, cursor, queue);
            hasSeededRemotePlayerIds = trackRemoteJoins(state, knownRemotePlayerIds, hasSeededRemotePlayerIds, queue);

            for (const item of queue) {
                if (renderedNoticeIds.has(item.id)) {
                    continue;
                }
                renderedNoticeIds.add(item.id);
                renderedNoticeOrder.push(item.id);
                pushToast(item);
            }

            while (renderedNoticeOrder.length > 128) {
                const oldest = renderedNoticeOrder.shift();
                if (!oldest) {
                    break;
                }
                renderedNoticeIds.delete(oldest);
            }
        },
        dispose: () => {
            for (const toast of activeToasts) {
                dismissToast(toast);
            }
            container.remove();
        }
    };
};
