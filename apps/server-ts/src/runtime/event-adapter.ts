const legacyToCanonicalType: Record<string, string> = {
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
};

const canonicalizeEventType = (type: string): string => {
    return legacyToCanonicalType[type] ?? type;
};

export const normalizeInboundEnvelopeType = (raw: unknown): unknown => {
    if (typeof raw !== "object" || raw === null) {
        return raw;
    }

    const envelope = raw as Record<string, unknown>;
    const type = envelope.type;
    if (typeof type !== "string") {
        return raw;
    }

    return {
        ...envelope,
        type: canonicalizeEventType(type)
    };
};
