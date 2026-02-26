import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { createHmac, timingSafeEqual } from "node:crypto";
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

const decodeBase64Url = (input: string): Buffer | null => {
    try {
        const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
        return Buffer.from(padded, "base64");
    } catch {
        return null;
    }
};

const verifyIdentityToken = (authToken: string | undefined): string | null => {
    if (typeof authToken !== "string" || authToken.trim().length === 0) {
        return null;
    }
    const secret = process.env.BATTLECITY_IDENTITY_SECRET;
    if (typeof secret !== "string" || secret.length < 16) {
        return null;
    }

    const [payloadPart, signaturePart] = authToken.split(".");
    if (!payloadPart || !signaturePart) {
        return null;
    }
    const signature = decodeBase64Url(signaturePart);
    if (!signature) {
        return null;
    }
    const expected = createHmac("sha256", secret).update(payloadPart).digest();
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
        return null;
    }

    const payloadBuffer = decodeBase64Url(payloadPart);
    if (!payloadBuffer) {
        return null;
    }
    let parsed: { sub?: unknown; exp?: unknown } | null = null;
    try {
        parsed = JSON.parse(payloadBuffer.toString("utf8")) as { sub?: unknown; exp?: unknown };
    } catch {
        return null;
    }

    const sub = typeof parsed?.sub === "string" ? parsed.sub.trim() : "";
    if (sub.length === 0) {
        return null;
    }
    const expRaw = Number(parsed?.exp);
    if (!Number.isFinite(expRaw)) {
        return null;
    }
    const expiryMs = expRaw > 1_000_000_000_000 ? Math.floor(expRaw) : Math.floor(expRaw * 1000);
    if (Date.now() >= expiryMs) {
        return null;
    }
    return sanitizeUserId(sub, "").slice(0, 120);
};

export const bindSocketIdentity = (
    state: RuntimeState,
    socketId: string,
    joinPayload: KnownEventPayloadByType["lobby.join.request"]
): string => {
    const verifiedSub = verifyIdentityToken(joinPayload.authToken);
    const userId = verifiedSub
        ? `verified:${verifiedSub}`
        : sanitizeUserId(undefined, `guest:${socketId}`);
    state.socketUserIds.set(socketId, userId);
    return userId;
};

export const resolveSocketUserId = (state: RuntimeState, socketId: string): string => {
    return state.socketUserIds.get(socketId) ?? socketId;
};
