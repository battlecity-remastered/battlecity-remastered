import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeState } from "../../runtime/types.js";

const sanitizeUserId = (rawUserId: string | undefined, fallback: string): string => {
    if (typeof rawUserId !== "string") {
        return fallback;
    }
    const trimmed = rawUserId.trim();
    if (trimmed.length === 0) {
        return fallback;
    }
    return trimmed.slice(0, 128);
};

export const bindSocketIdentity = (
    state: RuntimeState,
    socketId: string,
    joinPayload: KnownEventPayloadByType["lobby.join.request"]
): string => {
    const userId = sanitizeUserId(joinPayload.userId, socketId);
    state.socketUserIds.set(socketId, userId);
    return userId;
};

export const resolveSocketUserId = (state: RuntimeState, socketId: string): string => {
    return state.socketUserIds.get(socketId) ?? socketId;
};

