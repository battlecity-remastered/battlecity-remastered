import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const STORAGE_KEY = "battlecity.identity.v2";

export const restoreIdentity = (state: ClientState, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): void => {
    if (!storage) {
        return;
    }
    try {
        const raw = storage.getItem(STORAGE_KEY);
        if (!raw) {
            return;
        }
        const parsed = JSON.parse(raw) as Partial<ClientState["identity"]>;
        if (typeof parsed.userId === "string") {
            state.identity.userId = parsed.userId;
        }
        if (typeof parsed.callsign === "string" && parsed.callsign.trim().length > 0) {
            state.identity.callsign = parsed.callsign.trim().slice(0, 20);
        }
        if (parsed.provider === "google" || parsed.provider === "local") {
            state.identity.provider = parsed.provider;
        }
    } catch {
        storage.removeItem(STORAGE_KEY);
    }
};

const persistIdentity = (state: ClientState, storage: Storage | null = typeof window === "undefined" ? null : window.localStorage): void => {
    if (!storage) {
        return;
    }
    storage.setItem(STORAGE_KEY, JSON.stringify(state.identity));
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
