const CONTROL_CHAR_PATTERN = /[\u0000-\u001F\u007F]/g;
const NAME_MAX_LENGTH = 64;
type RuntimeUserProfile = {
    score: number;
    orbs: number;
    assists: number;
    updatedAt: number;
};

export const sanitizeDisplayName = (rawName: string | undefined, fallback: string): string => {
    if (typeof rawName !== "string") {
        return fallback;
    }
    const trimmed = rawName
        .replace(CONTROL_CHAR_PATTERN, "")
        .replace(/\s+/g, " ")
        .trim();
    if (trimmed.length === 0) {
        return fallback;
    }
    return trimmed.slice(0, NAME_MAX_LENGTH);
};

export const sanitizeUserId = (rawId: string): string => {
    return String(rawId)
        .replace(CONTROL_CHAR_PATTERN, "")
        .trim();
};

export const providerFromUserId = (userId: string): string => {
    const separator = userId.indexOf(":");
    if (separator <= 0) {
        return "local";
    }
    const provider = userId.slice(0, separator).trim().toLowerCase();
    return provider.length > 0 ? provider : "local";
};

export const escapeValue = (value: unknown): string => {
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return String(Math.floor(value));
    }
    const stringValue = String(value)
        .replace(CONTROL_CHAR_PATTERN, "")
        .replace(/'/g, "''");
    return `'${stringValue}'`;
};

export const parseBool = (raw: string | undefined): boolean | undefined => {
    if (raw === undefined) {
        return undefined;
    }
    const normalized = raw.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) {
        return true;
    }
    if (["0", "false", "no", "off"].includes(normalized)) {
        return false;
    }
    return undefined;
};

export const compareRuntimeProfiles = (left: RuntimeUserProfile, right: RuntimeUserProfile): number => {
    const scoreDiff = right.score - left.score;
    if (scoreDiff !== 0) {
        return scoreDiff;
    }
    const orbDiff = right.orbs - left.orbs;
    if (orbDiff !== 0) {
        return orbDiff;
    }
    const assistDiff = right.assists - left.assists;
    if (assistDiff !== 0) {
        return assistDiff;
    }
    return left.updatedAt - right.updatedAt;
};
