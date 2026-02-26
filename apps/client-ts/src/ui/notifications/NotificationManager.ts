import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";

const MAX_NOTICES = 8;
const MAX_VISIBLE = 5;
const DEFAULT_TIMEOUT_MS = 5000;
const EXIT_ANIMATION_MS = 180;

type NotificationItem = {
    id: string;
    text: string;
    title: string;
    body: string;
    variant: ToastVariant;
    timeoutMs: number;
    createdAt: number;
};

const enqueueNotice = (
    queue: NotificationItem[],
    notice: {
        title: string;
        body: string;
        variant: ToastVariant;
        timeoutMs: number;
    }
): void => {
    const title = notice.title.trim();
    const body = notice.body.trim();
    const text = title.length > 0 ? `${title}: ${body}` : body;
    queue.push({
        id: `${Date.now()}:${Math.random()}`,
        text,
        title,
        body,
        variant: notice.variant,
        timeoutMs: notice.timeoutMs,
        createdAt: Date.now()
    });
    while (queue.length > MAX_NOTICES) {
        queue.shift();
    }
};

export const collectNotificationEvents = (
    state: ClientState,
    previous: {
        promotionCount: number;
        lastBuildDeniedReason: string | null;
        lastDemolishDeniedReason: string | null;
        lastOrbedCityId: number | null;
        lastPlayerDeadSignature: string | null;
        lastRejectedReason: string | null;
        lastPickupSignature: string | null;
        lastChatRateLimitSignature: string | null;
    },
    queue: NotificationItem[]
): {
    promotionCount: number;
    lastBuildDeniedReason: string | null;
    lastDemolishDeniedReason: string | null;
    lastOrbedCityId: number | null;
    lastPlayerDeadSignature: string | null;
    lastRejectedReason: string | null;
    lastPickupSignature: string | null;
    lastChatRateLimitSignature: string | null;
} => {
    if (state.events.promotions.length > previous.promotionCount) {
        const promotion = state.events.promotions.at(-1);
        if (promotion) {
            enqueueNotice(queue, {
                title: "Promotion",
                body: `Promoted to ${promotion.rank} (+${promotion.score}).`,
                variant: "success",
                timeoutMs: 4200
            });
        }
    }
    if (state.events.lastBuildDeniedReason && state.events.lastBuildDeniedReason !== previous.lastBuildDeniedReason) {
        if (state.events.lastBuildDeniedReason === "research_required") {
            enqueueNotice(queue, {
                title: "Research Pending",
                body: "Research must finish before this structure can be built.",
                variant: "info",
                timeoutMs: 3600
            });
        } else if (state.events.lastBuildDeniedReason === "not_mayor") {
            enqueueNotice(queue, {
                title: "Construction Restricted",
                body: "Only mayors can authorise new construction.",
                variant: "warn",
                timeoutMs: 3600
            });
        } else if (state.events.lastBuildDeniedReason === "build_too_far") {
            enqueueNotice(queue, {
                title: "Construction Denied",
                body: `New structures must be placed near your existing ${getCityDisplayName(state.local.city)} build grid. Try placing closer to your city.`,
                variant: "warn",
                timeoutMs: 6500
            });
        } else {
            enqueueNotice(queue, {
                title: "Construction Denied",
                body: state.events.lastBuildDeniedReason,
                variant: "warn",
                timeoutMs: 3600
            });
        }
    }
    if (state.events.lastDemolishDeniedReason && state.events.lastDemolishDeniedReason !== previous.lastDemolishDeniedReason) {
        if (state.events.lastDemolishDeniedReason === "not_mayor") {
            enqueueNotice(queue, {
                title: "Demolition Restricted",
                body: "Only mayors can order demolitions.",
                variant: "warn",
                timeoutMs: 3200
            });
        } else {
            enqueueNotice(queue, {
                title: "Demolition Denied",
                body: state.events.lastDemolishDeniedReason,
                variant: "warn",
                timeoutMs: 3200
            });
        }
    }
    if (state.events.lastOrbedCityId !== null && state.events.lastOrbedCityId !== previous.lastOrbedCityId) {
        enqueueNotice(queue, {
            title: "City Orbed",
            body: `${getCityDisplayName(state.events.lastOrbedCityId)} was destroyed by orb strike.`,
            variant: "error",
            timeoutMs: 5200
        });
    }
    const death = state.events.lastPlayerDead;
    const deathSignature = death ? `${death.id}:${death.by ?? "-"}` : null;
    if (death && deathSignature && deathSignature !== previous.lastPlayerDeadSignature) {
        enqueueNotice(queue, {
            title: "Elimination",
            body: death.by ? `${death.id} killed by ${death.by}.` : `${death.id} destroyed.`,
            variant: "warn",
            timeoutMs: 5200
        });
    }
    if (state.events.lastRejectedReason && state.events.lastRejectedReason !== previous.lastRejectedReason) {
        if (state.events.lastRejectedReason === "rate_limited") {
            enqueueNotice(queue, {
                title: "Action Rate Limit",
                body: "Please wait before issuing that action again.",
                variant: "warn",
                timeoutMs: 2400
            });
        } else {
            enqueueNotice(queue, {
                title: "Request Rejected",
                body: state.events.lastRejectedReason,
                variant: "warn",
                timeoutMs: 2800
            });
        }
    }
    const chatScope = state.chat.rateLimitedScope === "global" ? "Global" : "Team";
    const chatRetryAt = state.chat.rateLimitedUntil;
    const chatRateLimitSignature = chatRetryAt ? `${state.chat.rateLimitedScope ?? "team"}:${chatRetryAt}` : null;
    if (chatRetryAt && chatRateLimitSignature !== previous.lastChatRateLimitSignature) {
        const seconds = Math.max(1, Math.ceil((chatRetryAt - Date.now()) / 1000));
        enqueueNotice(queue, {
            title: "Chat Rate Limit",
            body: `${chatScope} chat cooling down (${seconds}s)`,
            variant: "warn",
            timeoutMs: 2400
        });
    }
    const pickup = state.events.lastIconPickupConfirmed;
    const pickupSignature = pickup
        ? `${pickup.playerId}:${pickup.itemType}:${pickup.amount}:${pickup.cityId}`
        : null;
    return {
        promotionCount: state.events.promotions.length,
        lastBuildDeniedReason: state.events.lastBuildDeniedReason,
        lastDemolishDeniedReason: state.events.lastDemolishDeniedReason,
        lastOrbedCityId: state.events.lastOrbedCityId,
        lastPlayerDeadSignature: deathSignature,
        lastRejectedReason: state.events.lastRejectedReason,
        lastPickupSignature: pickupSignature,
        lastChatRateLimitSignature: chatRateLimitSignature
    };
};

export const buildNotificationLines = (items: ReadonlyArray<NotificationItem>): string[] => {
    if (items.length === 0) {
        return ["No recent events."];
    }
    return items.map((entry) => entry.text);
};

type NotificationManager = {
    render: () => void;
    dispose: () => void;
};

type ToastVariant = "info" | "success" | "warn" | "error";

const ensureStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById("battlecity-toast-styles")) {
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
        .battlecity-toast[data-variant="success"] {
            border-color: rgba(82, 176, 125, 0.5);
        }
        .battlecity-toast[data-variant="warn"] {
            border-color: rgba(220, 156, 72, 0.5);
        }
        .battlecity-toast[data-variant="error"] {
            border-color: rgba(220, 92, 92, 0.5);
        }
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
    if (gameContainer) {
        gameContainer.appendChild(container);
    } else {
        root.appendChild(container);
    }
    return container;
};

export const createNotificationManager = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): NotificationManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
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
    let lastSeen = {
        promotionCount: 0,
        lastBuildDeniedReason: null as string | null,
        lastDemolishDeniedReason: null as string | null,
        lastOrbedCityId: null as number | null,
        lastPlayerDeadSignature: null as string | null,
        lastRejectedReason: null as string | null,
        lastPickupSignature: null as string | null,
        lastChatRateLimitSignature: null as string | null
    };

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
            if (toast.parentNode) {
                toast.parentNode.removeChild(toast);
            }
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

        toast.addEventListener("click", () => dismissToast(toast));
        container.appendChild(toast);
        activeToasts.add(toast);
        requestAnimationFrame(() => {
            toast.dataset.visible = "true";
        });
        const timeoutHandle = window.setTimeout(() => dismissToast(toast), item.timeoutMs || DEFAULT_TIMEOUT_MS);
        toastTimeouts.set(toast, timeoutHandle);
    };

    return {
        render: () => {
            container.style.display = state.ui.showIntroModal ? "none" : "flex";
            container.style.opacity = String(state.ui.overlaysOpacity);
            lastSeen = collectNotificationEvents(state, lastSeen, queue);
            if (!hasSeededRemotePlayerIds) {
                for (const id of state.remotePlayers.keys()) {
                    knownRemotePlayerIds.add(id);
                }
                hasSeededRemotePlayerIds = true;
            } else {
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
                    enqueueNotice(queue, {
                        title: "Player joined",
                        body: `${id} joined in ${getCityDisplayName(remote.city)}.`,
                        variant: "info",
                        timeoutMs: 4200
                    });
                }
            }
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
            Array.from(activeToasts).forEach((toast) => dismissToast(toast));
            container.remove();
        }
    };
};
