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

const resolveIdentitySecret = (): string | null => {
    const secret = process.env.BATTLECITY_IDENTITY_SECRET;
    return typeof secret === "string" && secret.length >= 16 ? secret : null;
};

const splitTokenParts = (authToken: string): { payloadPart: string; signaturePart: string } | null => {
    const [payloadPart, signaturePart] = authToken.split(".");
    if (!payloadPart || !signaturePart) {
        return null;
    }
    return { payloadPart, signaturePart };
};

const hasValidSignature = (
    payloadPart: string,
    signaturePart: string,
    secret: string
): boolean => {
    const signature = decodeBase64Url(signaturePart);
    if (!signature) {
        return false;
    }
    const expected = createHmac("sha256", secret).update(payloadPart).digest();
    return signature.length === expected.length && timingSafeEqual(signature, expected);
};

const parseIdentityPayload = (payloadPart: string): { sub: string; exp: number } | null => {
    const payloadBuffer = decodeBase64Url(payloadPart);
    if (!payloadBuffer) {
        return null;
    }

    try {
        const parsed = JSON.parse(payloadBuffer.toString("utf8")) as { sub?: unknown; exp?: unknown };
        const sub = typeof parsed.sub === "string" ? parsed.sub.trim() : "";
        const exp = Number(parsed.exp);
        if (sub.length === 0 || !Number.isFinite(exp)) {
            return null;
        }
        return { sub, exp };
    } catch {
        return null;
    }
};

const isIdentityExpired = (exp: number): boolean => {
    const expiryMs = exp > 1_000_000_000_000 ? Math.floor(exp) : Math.floor(exp * 1000);
    return Date.now() >= expiryMs;
};

const verifyIdentityToken = (authToken: string | undefined): string | null => {
    if (typeof authToken !== "string" || authToken.trim().length === 0) {
        return null;
    }
    const secret = resolveIdentitySecret();
    if (!secret) {
        return null;
    }
    const parts = splitTokenParts(authToken);
    if (!parts) {
        return null;
    }
    if (!hasValidSignature(parts.payloadPart, parts.signaturePart, secret)) {
        return null;
    }
    const payload = parseIdentityPayload(parts.payloadPart);
    if (!payload || isIdentityExpired(payload.exp)) {
        return null;
    }
    return sanitizeUserId(payload.sub, "").slice(0, 120);
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
