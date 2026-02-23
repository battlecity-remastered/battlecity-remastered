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
    "chat:message": "chat.message",
    "chat:history": "chat.history",
    "chat:rate_limit": "chat.rate_limit",
    "city:finance": "city.finance",
    "research:update": "research.update",
    "factory:collect": "factory.collect.request",
    "hazard:spawn": "hazard.spawn",
    "hazard:remove": "hazard.remove",
    "orb:drop": "orb.drop.request",
    "city:orbed": "city.orbed",
    "score:promotion": "score.promotion",
    "build:denied": "build.denied",
    "demolish:denied": "demolish.denied"
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
