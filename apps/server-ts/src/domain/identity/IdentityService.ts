import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { RuntimeState } from "../../runtime/types.js";
import { resolveIdentitySecret } from "./account-token.js";

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

const splitTokenParts = (authToken: string): { payloadPart: string; signaturePart: string } | null => {
    const parts = authToken.split(".");
    if (parts.length !== 2) return null;
    const [payloadPart, signaturePart] = parts;
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

type IdentityPayload = { sub: string; exp: number; kind?: string; name?: string };
const parseIdentityPayload = (payloadPart: string): IdentityPayload | null => {
    const payloadBuffer = decodeBase64Url(payloadPart);
    if (!payloadBuffer) {
        return null;
    }

    try {
        const parsed = JSON.parse(payloadBuffer.toString("utf8")) as Partial<IdentityPayload>;
        const sub = typeof parsed.sub === "string" ? parsed.sub.trim() : "";
        const exp = Number(parsed.exp);
        if (sub.length === 0 || !Number.isFinite(exp)) {
            return null;
        }
        return { sub, exp, ...(typeof parsed.kind === "string" ? { kind: parsed.kind } : {}),
            ...(typeof parsed.name === "string" ? { name: parsed.name } : {}) };
    } catch {
        return null;
    }
};

const isIdentityExpired = (exp: number): boolean => {
    const expiryMs = exp > 1_000_000_000_000 ? Math.floor(exp) : Math.floor(exp * 1000);
    return Date.now() >= expiryMs;
};

export const verifyIdentityToken = (authToken: string | undefined): { userId: string; name?: string; provider?: "google" } | null => {
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
    const sub = sanitizeUserId(payload.sub, "").slice(0, 120);
    return { userId: payload.kind === "account" ? sub : `verified:${sub}`,
        ...(payload.kind === "account" ? { provider: "google" as const } : {}),
        ...(payload.name ? { name: payload.name } : {}) };
};

export const bindSocketIdentity = (
    state: RuntimeState,
    socketId: string,
    joinPayload: KnownEventPayloadByType["lobby.join.request"]
): string => {
    const verified = verifyIdentityToken(joinPayload.authToken);
    const userId = verified
        ? verified.userId
        : sanitizeUserId(undefined, `guest:${socketId}`);
    state.socketUserIds.set(socketId, userId);
    return userId;
};

export const resolveSocketUserId = (state: RuntimeState, socketId: string): string => {
    return state.socketUserIds.get(socketId) ?? socketId;
};
