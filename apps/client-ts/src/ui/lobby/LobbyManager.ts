import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const MAX_ASSIGNMENTS = 8;

export const buildLobbyLines = (state: ClientState): string[] => {
    const header = `Lobby city ${state.local.city} (${state.local.id ?? "pending"})`;
    const denied = state.lobby.deniedReason ? `Denied: ${state.lobby.deniedReason}` : "Denied: -";
    const released = state.lobby.lastReleasedPlayerId
        ? `Released: ${state.lobby.lastReleasedPlayerId}`
        : "Released: -";
    const assignments = state.lobby.assignments
        .slice(0, MAX_ASSIGNMENTS)
        .map((entry) => {
            const mayor = entry.mayorId ?? "-";
            return `C${entry.city}: mayor ${mayor} recruits ${entry.recruitCount}`;
        });
    if (assignments.length === 0) {
        assignments.push("No active assignments");
    }
    return [header, denied, released, ...assignments];
};

type LobbyManager = {
    render: () => void;
    dispose: () => void;
};

export const createLobbyManager = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): LobbyManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "lobby");
    panel.style.position = "fixed";
    panel.style.top = "12px";
    panel.style.right = "12px";
    panel.style.padding = "10px";
    panel.style.margin = "0";
    panel.style.background = "rgba(0, 0, 0, 0.55)";
    panel.style.border = "1px solid rgba(144, 188, 255, 0.6)";
    panel.style.color = "#9fd0ff";
    panel.style.font = "12px/1.4 monospace";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "50";

    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showOptionsModal ? "none" : "block";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const text = buildLobbyLines(state).join("\n");
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("lobby", signature)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
