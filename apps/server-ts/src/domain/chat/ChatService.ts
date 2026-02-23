import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectResult, type CommandResult, type RuntimeConfig, type RuntimeState } from "../../runtime/types.js";

const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;

const LIMITS = {
    team: { windowMs: 6000, max: 5 },
    global: { windowMs: 15000, max: 3 }
} as const;

const sanitizeText = (value: string): string => {
    const stripped = value.replace(CONTROL_CHAR_PATTERN, "").replace(/\s+/g, " ").trim();
    if (stripped.length <= 240) {
        return stripped;
    }
    return stripped.slice(0, 240);
};

const ensureBucket = (state: RuntimeState, socketId: string): { team: number[]; global: number[] } => {
    const existing = state.chatRateLimit.get(socketId);
    if (existing) {
        return existing;
    }
    const created = { team: [], global: [] };
    state.chatRateLimit.set(socketId, created);
    return created;
};

const isRateLimited = (
    state: RuntimeState,
    socketId: string,
    scope: "team" | "global"
): { limited: boolean; retryAt: number } => {
    const now = Date.now();
    const limit = LIMITS[scope];
    const bucket = ensureBucket(state, socketId);
    const recent = bucket[scope].filter((timestamp) => timestamp > now - limit.windowMs);
    bucket[scope] = recent;
    state.chatRateLimit.set(socketId, bucket);

    if (recent.length < limit.max) {
        return { limited: false, retryAt: now };
    }
    const oldest = recent.reduce((min, ts) => Math.min(min, ts), recent[0] ?? now);
    return { limited: true, retryAt: oldest + limit.windowMs };
};

export type ChatCommandResult = {
    message?: KnownEventPayloadByType["chat.message"];
    rateLimit?: KnownEventPayloadByType["chat.rate_limit"];
};

export const addChatMessage = (
    state: RuntimeState,
    socketId: string,
    payload: KnownEventPayloadByType["chat.message.request"],
    config: RuntimeConfig
): CommandResult<ChatCommandResult> => {
    const text = sanitizeText(payload.text);
    if (!text) {
        return { ok: true, value: {} };
    }

    const scope: "team" | "global" = payload.scope ?? "team";
    const rateLimit = isRateLimited(state, socketId, scope);
    if (rateLimit.limited) {
        return rejectResult("chat_rate_limited");
    }

    const city = state.socketCities.get(socketId) ?? 0;
    const message: KnownEventPayloadByType["chat.message"] = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        from: socketId,
        city,
        text,
        ts: Date.now(),
        scope
    };

    const bucket = ensureBucket(state, socketId);
    bucket[scope].push(Date.now());
    state.chatRateLimit.set(socketId, bucket);
    state.chatHistory.push(message);
    if (state.chatHistory.length > config.chatHistoryLimit) {
        state.chatHistory.splice(0, state.chatHistory.length - config.chatHistoryLimit);
    }

    return { ok: true, value: { message } };
};

export const getChatHistory = (state: RuntimeState): KnownEventPayloadByType["chat.history"] => {
    return [...state.chatHistory];
};

const canSocketSeeMessage = (
    state: RuntimeState,
    socketId: string,
    message: KnownEventPayloadByType["chat.message"]
): boolean => {
    if (message.scope === "global") {
        return true;
    }
    const city = state.socketCities.get(socketId);
    return city !== undefined && city === message.city;
};

export const getChatHistoryForSocket = (
    state: RuntimeState,
    socketId: string
): KnownEventPayloadByType["chat.history"] => {
    return state.chatHistory.filter((message) => canSocketSeeMessage(state, socketId, message));
};
