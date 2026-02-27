import type { ClientState } from "../../app/state.js";
import { getCityDisplayName } from "../../world/city-spawn.js";

const MAX_NOTICES = 8;

export type ToastVariant = "info" | "success" | "warn" | "error";

export type NotificationItem = {
    id: string;
    text: string;
    title: string;
    body: string;
    variant: ToastVariant;
    timeoutMs: number;
    createdAt: number;
};

export type NotificationCursor = {
    promotionCount: number;
    lastBuildDeniedReason: string | null;
    lastDemolishDeniedReason: string | null;
    lastOrbedCityId: number | null;
    lastPlayerDeadSignature: string | null;
    lastRejectedReason: string | null;
    lastPickupSignature: string | null;
    lastChatRateLimitSignature: string | null;
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
    queue.push({
        id: `${Date.now()}:${Math.random()}`,
        text: title.length > 0 ? `${title}: ${body}` : body,
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

const collectPromotion = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): void => {
    if (state.events.promotions.length <= previous.promotionCount) {
        return;
    }
    const promotion = state.events.promotions.at(-1);
    if (!promotion) {
        return;
    }
    enqueueNotice(queue, {
        title: "Promotion",
        body: `Promoted to ${promotion.rank} (+${promotion.score}).`,
        variant: "success",
        timeoutMs: 4200
    });
};

const collectBuildDenied = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): void => {
    const reason = state.events.lastBuildDeniedReason;
    if (!reason || reason === previous.lastBuildDeniedReason) {
        return;
    }
    if (reason === "research_required") {
        enqueueNotice(queue, {
            title: "Research Pending",
            body: "Research must finish before this structure can be built.",
            variant: "info",
            timeoutMs: 3600
        });
        return;
    }
    if (reason === "not_mayor") {
        enqueueNotice(queue, {
            title: "Construction Restricted",
            body: "Only mayors can authorise new construction.",
            variant: "warn",
            timeoutMs: 3600
        });
        return;
    }
    if (reason === "build_too_far") {
        enqueueNotice(queue, {
            title: "Construction Denied",
            body: `New structures must be placed near your existing ${getCityDisplayName(state.local.city)} build grid. Try placing closer to your city.`,
            variant: "warn",
            timeoutMs: 6500
        });
        return;
    }
    enqueueNotice(queue, {
        title: "Construction Denied",
        body: reason,
        variant: "warn",
        timeoutMs: 3600
    });
};

const collectDemolishDenied = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): void => {
    const reason = state.events.lastDemolishDeniedReason;
    if (!reason || reason === previous.lastDemolishDeniedReason) {
        return;
    }
    enqueueNotice(queue, {
        title: reason === "not_mayor" ? "Demolition Restricted" : "Demolition Denied",
        body: reason === "not_mayor" ? "Only mayors can order demolitions." : reason,
        variant: "warn",
        timeoutMs: 3200
    });
};

const collectOrb = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): void => {
    if (state.events.lastOrbedCityId === null || state.events.lastOrbedCityId === previous.lastOrbedCityId) {
        return;
    }
    enqueueNotice(queue, {
        title: "City Orbed",
        body: `${getCityDisplayName(state.events.lastOrbedCityId)} was destroyed by orb strike.`,
        variant: "error",
        timeoutMs: 5200
    });
};

const collectDeath = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): string | null => {
    const death = state.events.lastPlayerDead;
    const signature = death ? `${death.id}:${death.by ?? "-"}` : null;
    if (!death || !signature || signature === previous.lastPlayerDeadSignature) {
        return signature;
    }
    enqueueNotice(queue, {
        title: "Elimination",
        body: death.by ? `${death.id} killed by ${death.by}.` : `${death.id} destroyed.`,
        variant: "warn",
        timeoutMs: 5200
    });
    return signature;
};

const collectRejected = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): void => {
    const reason = state.events.lastRejectedReason;
    if (!reason || reason === previous.lastRejectedReason) {
        return;
    }
    enqueueNotice(queue, {
        title: reason === "rate_limited" ? "Action Rate Limit" : "Request Rejected",
        body: reason === "rate_limited" ? "Please wait before issuing that action again." : reason,
        variant: "warn",
        timeoutMs: reason === "rate_limited" ? 2400 : 2800
    });
};

const collectChatRateLimit = (state: ClientState, previous: NotificationCursor, queue: NotificationItem[]): string | null => {
    const retryAt = state.chat.rateLimitedUntil;
    const signature = retryAt ? `${state.chat.rateLimitedScope ?? "team"}:${retryAt}` : null;
    if (!retryAt || signature === previous.lastChatRateLimitSignature) {
        return signature;
    }
    const scope = state.chat.rateLimitedScope === "global" ? "Global" : "Team";
    const seconds = Math.max(1, Math.ceil((retryAt - Date.now()) / 1000));
    enqueueNotice(queue, {
        title: "Chat Rate Limit",
        body: `${scope} chat cooling down (${seconds}s)`,
        variant: "warn",
        timeoutMs: 2400
    });
    return signature;
};

export const collectNotificationEvents = (
    state: ClientState,
    previous: NotificationCursor,
    queue: NotificationItem[]
): NotificationCursor => {
    collectPromotion(state, previous, queue);
    collectBuildDenied(state, previous, queue);
    collectDemolishDenied(state, previous, queue);
    collectOrb(state, previous, queue);
    const deathSignature = collectDeath(state, previous, queue);
    collectRejected(state, previous, queue);
    const chatRateLimitSignature = collectChatRateLimit(state, previous, queue);
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
