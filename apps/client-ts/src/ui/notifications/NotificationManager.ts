import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const MAX_NOTICES = 5;

type NotificationItem = {
    id: string;
    text: string;
    createdAt: number;
};

const enqueueNotice = (
    queue: NotificationItem[],
    text: string
): void => {
    queue.push({
        id: `${Date.now()}:${Math.random()}`,
        text,
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
    },
    queue: NotificationItem[]
): {
    promotionCount: number;
    lastBuildDeniedReason: string | null;
    lastDemolishDeniedReason: string | null;
    lastOrbedCityId: number | null;
} => {
    if (state.events.promotions.length > previous.promotionCount) {
        const promotion = state.events.promotions.at(-1);
        if (promotion) {
            enqueueNotice(queue, `Promotion: ${promotion.rank} (+${promotion.score})`);
        }
    }
    if (state.events.lastBuildDeniedReason && state.events.lastBuildDeniedReason !== previous.lastBuildDeniedReason) {
        enqueueNotice(queue, `Build denied: ${state.events.lastBuildDeniedReason}`);
    }
    if (state.events.lastDemolishDeniedReason && state.events.lastDemolishDeniedReason !== previous.lastDemolishDeniedReason) {
        enqueueNotice(queue, `Demolish denied: ${state.events.lastDemolishDeniedReason}`);
    }
    if (state.events.lastOrbedCityId !== null && state.events.lastOrbedCityId !== previous.lastOrbedCityId) {
        enqueueNotice(queue, `City ${state.events.lastOrbedCityId} was orbed`);
    }
    return {
        promotionCount: state.events.promotions.length,
        lastBuildDeniedReason: state.events.lastBuildDeniedReason,
        lastDemolishDeniedReason: state.events.lastDemolishDeniedReason,
        lastOrbedCityId: state.events.lastOrbedCityId
    };
};

export const buildNotificationLines = (items: ReadonlyArray<NotificationItem>): string[] => {
    if (items.length === 0) {
        return ["No notifications"];
    }
    return items.map((entry) => entry.text);
};

type NotificationManager = {
    render: () => void;
    dispose: () => void;
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

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "notifications");
    panel.style.position = "fixed";
    panel.style.left = "12px";
    panel.style.bottom = "82px";
    panel.style.padding = "8px 10px";
    panel.style.margin = "0";
    panel.style.background = "rgba(16, 20, 28, 0.74)";
    panel.style.border = "1px solid rgba(120, 148, 196, 0.82)";
    panel.style.color = "#d8e6ff";
    panel.style.font = "12px/1.35 monospace";
    panel.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "60";
    root.appendChild(panel);

    const dirty = createDirtyFlagTracker();
    const queue: NotificationItem[] = [];
    let lastSeen = {
        promotionCount: 0,
        lastBuildDeniedReason: null as string | null,
        lastDemolishDeniedReason: null as string | null,
        lastOrbedCityId: null as number | null
    };

    return {
        render: () => {
            panel.style.display = state.ui.showIntroModal ? "none" : "block";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            lastSeen = collectNotificationEvents(state, lastSeen, queue);
            const now = Date.now();
            while (queue.length > 0 && (now - queue[0]!.createdAt) > 8000) {
                queue.shift();
            }
            const text = buildNotificationLines(queue).join("\n");
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("notifications", signature)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
