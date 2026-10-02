import type { ClientState } from "../../app/state.js";
import { persistIdentity } from "./IdentityManager.js";

export const clearAccountSession = (state: ClientState): void => {
    delete state.identity.authToken;
    delete state.identity.authExpiresAt;
    state.identity.authPending = false;
    state.identity.userId = null;
    state.identity.provider = "local";
    persistIdentity(state);
};

export const acceptAccountSession = (state: ClientState, value: unknown): void => {
    const session = value as Record<string, unknown>;
    if (typeof session?.authToken !== "string" || typeof session.userId !== "string"
        || typeof session.callsign !== "string" || typeof session.expiresAt !== "number") throw new Error("Invalid sign-in response");
    Object.assign(state.identity, { authToken: session.authToken, userId: session.userId,
        callsign: session.callsign, authExpiresAt: session.expiresAt, provider: "google", authPending: false });
    persistIdentity(state);
};

export const identityJoinFields = (state: ClientState): { callsign: string; userId?: string; authToken?: string } => ({
    callsign: state.identity.callsign,
    ...(state.identity.userId ? { userId: state.identity.userId } : {}),
    ...(state.identity.authToken ? { authToken: state.identity.authToken } : {})
});
