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
    "player:bot_damage": "player.bot_damage",
    "player:dead": "player.dead",
    "player:removed": "player.removed",
    "players:snapshot": "players.snapshot",
    "bullet:fired": "bullet.fired",
    "bullet:resolved": "bullet.resolved",
    "chat:message": "chat.message",
    "chat:history": "chat.history",
    "chat:rate_limit": "chat.rate_limit",
    "city:finance": "city.finance",
    "research:update": "research.update",
    "factory:collect": "factory.collect.request",
    "icon:pickup": "icon.pickup.request",
    "icon:pickup:confirmed": "icon.pickup.confirmed",
    "inventory:update": "inventory.update",
    "item:use": "item.use.request",
    "hazard:spawn": "hazard.spawn",
    "hazard:remove": "hazard.remove",
    "orb:drop": "orb.drop.request",
    "city:orbed": "city.orbed",
    "score:promotion": "score.promotion",
    "score:profile": "score.profile",
    "population:update": "population.update",
    "defense:deploy": "defense.deploy.request",
    "defense:spawn": "defense.spawn",
    "defense:update": "defense.update",
    "defense:remove": "defense.remove",
    "build:denied": "build.denied",
    "demolish:denied": "demolish.denied",
    "event:rejected": "event.rejected",
    new_building: "building.placed",
    demolish_building: "building.demolished"
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
