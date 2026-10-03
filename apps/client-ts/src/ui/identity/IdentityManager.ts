import { generateGuestCallsign, isDefaultGuestCallsign } from "./guest-callsign.js";
import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const STORAGE_KEY = "battlecity.identity.v2";

const identityStorage = (): Storage | null => {
    try { return typeof window === "undefined" ? null : window.localStorage; }
    catch { return null; }
};
const hydrateStoredIdentity = (state: ClientState, parsed: Partial<ClientState["identity"]>): void => {
    if (typeof parsed.authToken === "string" && typeof parsed.authExpiresAt === "number" && parsed.authExpiresAt > Date.now()) {
        state.identity.authToken = parsed.authToken;
        state.identity.authExpiresAt = parsed.authExpiresAt;
    }
    if (typeof parsed.userId === "string") {
        state.identity.userId = parsed.userId;
    }
    if (typeof parsed.callsign === "string" && parsed.callsign.trim().length > 0) {
        state.identity.callsign = parsed.callsign.trim().slice(0, 20);
    }
    if (parsed.provider === "google" || parsed.provider === "local") {
        state.identity.provider = parsed.provider;
    }
};

export const restoreIdentity = (state: ClientState, storage: Storage | null = identityStorage()): void => {
    if (!storage) {
        if (isDefaultGuestCallsign(state.identity.callsign)) state.identity.callsign = generateGuestCallsign();
        return;
    }
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            state.identity.callsign = generateGuestCallsign();
            persistIdentity(state, storage);
            return;
        }
        const parsed = JSON.parse(raw) as Partial<ClientState["identity"]>;
        hydrateStoredIdentity(state, parsed);
    } catch {
        // Malformed or unavailable storage must not prevent guest play.
        state.identity.callsign = generateGuestCallsign();
        persistIdentity(state, storage);
    }
    if (state.identity.provider === "local" && !state.identity.authToken && isDefaultGuestCallsign(state.identity.callsign)) {
        state.identity.callsign = generateGuestCallsign();
        persistIdentity(state, storage);
    }
};

export const persistIdentity = (state: ClientState, storage: Storage | null = identityStorage()): void => {
    if (!storage) {
        return;
    }
    try { storage.setItem(STORAGE_KEY, JSON.stringify(state.identity)); }
    catch { /* The current signed session can still play when storage is unavailable. */ }
};

export const registerIdentityHotkeys = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        if (event.key === "F6") {
            state.ui.showIdentityPanel = !state.ui.showIdentityPanel;
            event.preventDefault();
            return;
        }
        if (!state.ui.showIdentityPanel) {
            return;
        }
        if (event.key === "g" || event.key === "G") {
            state.identity.provider = state.identity.provider === "google" ? "local" : "google";
            persistIdentity(state);
            event.preventDefault();
            return;
        }
        if (event.key === "Enter") {
            persistIdentity(state);
            state.ui.showIdentityPanel = false;
            event.preventDefault();
        }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
};

type IdentityManager = {
    render: () => void;
    dispose: () => void;
};

const buildIdentityLines = (state: ClientState): string[] => {
    return [
        "Identity",
        `User: ${state.identity.userId ?? "guest"}`,
        `Callsign: ${state.identity.callsign}`,
        `Provider: ${state.identity.provider}`,
        "F6: toggle panel",
        "G: toggle local/google",
        "Enter: save"
    ];
};

export const createIdentityManager = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): IdentityManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    restoreIdentity(state);
    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "identity");
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.top = "12px";
    panel.style.padding = "10px";
    panel.style.margin = "0";
    panel.style.background = "rgba(22, 18, 31, 0.86)";
    panel.style.border = "1px solid rgba(195, 162, 250, 0.75)";
    panel.style.color = "#f2e9ff";
    panel.style.font = "12px/1.4 monospace";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "115";
    root.appendChild(panel);

    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showIdentityPanel ? "block" : "none";
            if (!state.ui.showIdentityPanel) {
                return;
            }
            const text = buildIdentityLines(state).join("\n");
            if (dirty.shouldRender("identity", text)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            persistIdentity(state);
            dirty.clear();
            panel.remove();
        }
    };
};
