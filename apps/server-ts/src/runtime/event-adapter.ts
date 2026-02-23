import { canonicalizeEventType } from "@battlecity/protocol";

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
