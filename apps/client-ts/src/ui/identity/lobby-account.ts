import type { ClientState } from "../../app/state.js";
import { acceptAccountSession, clearAccountSession } from "./account-session.js";

type GoogleIdentity = {
    initialize: (config: { client_id: string; callback: (result: { credential: string }) => void }) => void;
    renderButton: (container: HTMLElement, options: { theme: string; size: string; text: string }) => void;
    disableAutoSelect: () => void;
};
const googleIdentity = (): GoogleIdentity | undefined => (window as Window & { google?: { accounts: { id: GoogleIdentity } } }).google?.accounts.id;
let googleLibrary: Promise<GoogleIdentity> | undefined;
const loadGoogleIdentity = (): Promise<GoogleIdentity> => {
    if (googleIdentity()) return Promise.resolve(googleIdentity()!);
    if (!googleLibrary) googleLibrary = new Promise<GoogleIdentity>((resolve, reject) => {
        const script = document.createElement("script"); script.src = "https://accounts.google.com/gsi/client"; script.async = true;
        script.onload = () => googleIdentity() ? resolve(googleIdentity()!) : reject(new Error("Google sign-in unavailable"));
        script.onerror = () => { script.remove(); googleLibrary = undefined; reject(new Error("Google sign-in unavailable")); };
        document.head.append(script);
    });
    return googleLibrary;
};

const restoreSession = async (state: ClientState): Promise<boolean> => {
    if (!state.identity.authToken) return false;
    state.identity.authPending = true;
    try {
        const response = await fetch("/api/auth/session", { headers: { Authorization: `Bearer ${state.identity.authToken}` } });
        if (response.status === 401) { clearAccountSession(state); return false; }
        if (!response.ok) throw new Error("Sign-in check unavailable. Please retry.");
        const account = await response.json() as { userId: string; callsign: string };
        state.identity.userId = account.userId; state.identity.callsign = account.callsign;
        return true;
    } finally { state.identity.authPending = false; }
};

export const createLobbyAccount = (state: ClientState, header: HTMLElement): (() => void) => {
    const panel = document.createElement("div"), status = document.createElement("span"), controls = document.createElement("div");
    panel.className = "lobby-account"; panel.dataset.ui = "lobby-account"; status.setAttribute("role", "status");
    panel.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:10px 0;color:#d7c9a4;font:12px/1.5 monospace";
    panel.append(status, controls); header.append(panel); let disposed = false;
    const showSignedIn = (): void => {
        status.textContent = `Signed in as ${state.identity.callsign} · scores saved`;
        const logout = document.createElement("button"); logout.className = "lobby-btn"; logout.textContent = "Sign out";
        logout.onclick = () => { clearAccountSession(state); googleIdentity()?.disableAutoSelect(); void initialize(); };
        controls.replaceChildren(logout);
    };
    const signIn = async (credential: string): Promise<void> => {
        if (state.local.id !== null || disposed) return;
        state.identity.authPending = true; status.textContent = "Signing in…";
        try {
            const response = await fetch("/api/auth/google", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ credential }) });
            if (!response.ok) throw new Error("Sign-in failed. Please try again.");
            const session: unknown = await response.json();
            if (!disposed) { acceptAccountSession(state, session); showSignedIn(); }
        } catch (error) { if (!disposed) status.textContent = (error as Error).message; }
        finally { state.identity.authPending = false; }
    };
    const initialize = async (): Promise<void> => {
        controls.replaceChildren(); status.textContent = "Guest · sign in to restore your score";
        try {
            if (await restoreSession(state)) { if (!disposed) showSignedIn(); return; }
            const response = await fetch("/api/identity/config");
            if (!response.ok) { status.textContent = "Playing as guest"; return; }
            const config = await response.json() as { google: { enabled: boolean; clientId: string } };
            if (!config.google.enabled || disposed) { status.textContent = "Playing as guest"; return; }
            const google = await loadGoogleIdentity();
            if (disposed) return;
            google.initialize({ client_id: config.google.clientId, callback: result => { void signIn(result.credential); } });
            google.renderButton(controls, { theme: "filled_black", size: "medium", text: "signin_with" });
        } catch { if (!disposed) status.textContent = "Sign-in unavailable. Refresh to retry, or play as guest."; }
    };
    void initialize();
    return () => { disposed = true; panel.remove(); };
};
