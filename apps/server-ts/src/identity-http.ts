import express, { type Express } from "express";
import { OAuth2Client } from "google-auth-library";
import { AccountStore, type Account } from "./adapters/persistence/AccountStore.js";
import { resolveScoreDatabasePath } from "./adapters/persistence/score-database-path.js";
import { issueAccountToken, persistIdentitySecret } from "./domain/identity/account-token.js";
import { verifyIdentityToken } from "./domain/identity/IdentityService.js";

export type IdentityHttpServices = { clientIds: string[]; authenticate: (credential: string) => Promise<Account> };
export const createIdentityHttpServices = (): IdentityHttpServices => {
    const clientIds = (process.env.GOOGLE_CLIENT_IDS || process.env.GOOGLE_CLIENT_ID || "").split(/[\s,]+/).filter(Boolean);
    if (!clientIds.length) return { clientIds, authenticate: async () => { throw new Error("Google sign-in unavailable"); } };
    const dbPath = resolveScoreDatabasePath();
    persistIdentitySecret(dbPath);
    const accounts = new AccountStore(dbPath), google = new OAuth2Client();
    return { clientIds, authenticate: async credential => {
        const ticket = await google.verifyIdToken({ idToken: credential, audience: clientIds });
        const payload = ticket.getPayload();
        if (!payload?.sub) throw new Error("Invalid Google identity");
        return accounts.googleAccount(payload.sub, payload.name);
    } };
};

export const registerIdentityHttp = (app: Express, services: IdentityHttpServices): void => {
    app.get("/api/identity/config", (_req, res) => res.json({ google: { enabled: services.clientIds.length > 0, clientId: services.clientIds[0] ?? null } }));
    app.get("/api/auth/session", (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        const session = verifyIdentityToken(req.headers.authorization?.replace(/^Bearer /, ""));
        if (!session) { res.status(401).json({ error: "session_expired" }); return; }
        res.json({ userId: session.userId, callsign: session.name, provider: session.provider ?? "local" });
    });
    let activeVerifications = 0;
    app.post("/api/auth/google", express.json({ limit: "8kb" }), async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        if (!services.clientIds.length) { res.status(503).json({ error: "signin_unavailable" }); return; }
        const credential = req.body?.credential;
        if (typeof credential !== "string" || !credential || credential.length > 7000) { res.status(400).json({ error: "missing_credential" }); return; }
        if (activeVerifications >= 4) { res.status(429).json({ error: "try_again" }); return; }
        activeVerifications++;
        try {
            const account = await services.authenticate(credential);
            res.json({ userId: account.id, callsign: account.name, provider: account.provider, ...issueAccountToken(account.id, account.name) });
        } catch { res.status(401).json({ error: "signin_failed" }); }
        finally { activeVerifications--; }
    });
};
