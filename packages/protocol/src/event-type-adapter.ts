import type { KnownEventType } from "./envelope.js";

const legacyToCanonicalType = {
    "lobby:join:request": "lobby.join.request",
    "lobby:leave": "lobby.leave.request",
    "lobby:assignment": "lobby.assignment",
    "lobby:denied": "lobby.denied",
    "lobby:released": "lobby.released",
    "lobby:snapshot": "lobby.snapshot",
    "player:update": "player.update",
    "player:health": "player.health",
    "player:dead": "player.dead",
    "player:removed": "player.removed",
    "players:snapshot": "players.snapshot",
    "chat:message": "chat.message"
} as const;

export type LegacyEventType = keyof typeof legacyToCanonicalType;

export const canonicalizeEventType = (eventType: string): string => {
    return legacyToCanonicalType[eventType as LegacyEventType] ?? eventType;
};

export const isLegacyAliasEventType = (eventType: string): eventType is LegacyEventType => {
    return eventType in legacyToCanonicalType;
};

export const canonicalizeKnownEventType = (eventType: string): KnownEventType | undefined => {
    const canonical = canonicalizeEventType(eventType);
    return canonical as KnownEventType;
};
