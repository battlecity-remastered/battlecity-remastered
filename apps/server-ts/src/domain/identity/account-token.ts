import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

let fallbackSecret = randomBytes(32).toString("base64url");
export const resolveIdentitySecret = (): string => {
    const configured = process.env.BATTLECITY_IDENTITY_SECRET;
    return configured && configured.length >= 16 ? configured : fallbackSecret;
};

// Keep sessions valid through app replacement, beside the existing score DB.
export const persistIdentitySecret = (dbPath: string): void => {
    if (process.env.BATTLECITY_IDENTITY_SECRET) return;
    const filename = path.join(path.dirname(dbPath), ".identity-secret");
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    try { fs.writeFileSync(filename, fallbackSecret, { flag: "wx", mode: 0o600 }); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const stored = fs.readFileSync(filename, "utf8").trim();
    if (stored.length < 32) throw new Error("Invalid persisted identity secret");
    fallbackSecret = stored;
};

export const issueAccountToken = (userId: string, name: string): { authToken: string; expiresAt: number } => {
    const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    const payload = Buffer.from(JSON.stringify({ sub: userId, name, kind: "account", exp: expiresAt })).toString("base64url");
    const signature = createHmac("sha256", resolveIdentitySecret()).update(payload).digest("base64url");
    return { authToken: `${payload}.${signature}`, expiresAt };
};
