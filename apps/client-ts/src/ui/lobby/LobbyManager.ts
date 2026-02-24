import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const MAX_ASSIGNMENTS = 8;

const collectVisibleCities = (state: ClientState): number[] => {
    const cities = new Set<number>();
    cities.add(state.local.city);
    for (const assignment of state.lobby.assignments) {
        cities.add(assignment.city);
    }
    return Array.from(cities.values()).sort((a, b) => a - b);
};

const resolveFilterLabel = (state: ClientState): string => {
    return state.ui.lobbyCityFilter < 0 ? "all" : String(state.ui.lobbyCityFilter);
};

export const applyLobbyAction = (state: ClientState, key: string): boolean => {
    if (key === "Tab") {
        state.ui.lobbyView = state.ui.lobbyView === "assignments" ? "scores" : "assignments";
        return true;
    }
    if (key === "Home") {
        state.ui.lobbyCityFilter = -1;
        return true;
    }
    if (key !== "PageUp" && key !== "PageDown") {
        return false;
    }
    const cities = collectVisibleCities(state);
    if (cities.length === 0) {
        state.ui.lobbyCityFilter = -1;
        return true;
    }
    const sequence = [-1, ...cities];
    const currentIndex = Math.max(0, sequence.indexOf(state.ui.lobbyCityFilter));
    const offset = key === "PageDown" ? 1 : -1;
    const nextIndex = (currentIndex + offset + sequence.length) % sequence.length;
    state.ui.lobbyCityFilter = sequence[nextIndex] ?? -1;
    return true;
};

export const buildLobbyLines = (state: ClientState): string[] => {
    const header = `City ${state.local.city} lobby  ${state.local.id ?? "pending"}`;
    const mode = `View: ${state.ui.lobbyView}  Filter: ${resolveFilterLabel(state)} (Tab/PgUp/PgDn/Home)`;
    const denied = state.lobby.deniedReason ? `Denied: ${state.lobby.deniedReason}` : "Denied: -";
    const released = state.lobby.lastReleasedPlayerId
        ? `Released: ${state.lobby.lastReleasedPlayerId}`
        : "Released: -";
    if (state.ui.lobbyView === "scores") {
        const ranked = Array.from(state.cityFinance.entries())
            .sort((a, b) => {
                const scoreDiff = b[1].score - a[1].score;
                if (scoreDiff !== 0) {
                    return scoreDiff;
                }
                return b[1].cash - a[1].cash;
            })
            .filter(([city]) => state.ui.lobbyCityFilter < 0 || state.ui.lobbyCityFilter === city)
            .slice(0, MAX_ASSIGNMENTS)
            .map(([city, finance], index) => {
                return `#${index + 1} C${city}: score ${finance.score} cash ${finance.cash} inc ${finance.income}`;
            });
        if (ranked.length === 0) {
            ranked.push("No city finance snapshots");
        }
        return [header, mode, denied, released, ...ranked];
    }

    const assignments = state.lobby.assignments
        .filter((entry) => state.ui.lobbyCityFilter < 0 || state.ui.lobbyCityFilter === entry.city)
        .slice(0, MAX_ASSIGNMENTS)
        .map((entry) => {
            const mayor = entry.mayorId ?? "-";
            return `C${entry.city}: mayor ${mayor} recruits ${entry.recruitCount}`;
        });
    if (assignments.length === 0) {
        assignments.push("No active assignments");
    }
    return [header, mode, denied, released, ...assignments];
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
    panel.style.padding = "10px 12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(18, 29, 26, 0.74)";
    panel.style.border = "1px solid rgba(140, 189, 166, 0.82)";
    panel.style.color = "#d0ecd4";
    panel.style.font = "12px/1.4 monospace";
    panel.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "50";

    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();
    const onKeyDown = (event: KeyboardEvent): void => {
        if (state.ui.showIntroModal || state.ui.showOptionsModal) {
            return;
        }
        if (applyLobbyAction(state, event.key)) {
            event.preventDefault();
        }
    };
    window.addEventListener("keydown", onKeyDown);

    return {
        render: () => {
            panel.style.display = state.ui.showOptionsModal || state.ui.showIntroModal ? "none" : "block";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const text = buildLobbyLines(state).join("\n");
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("lobby", signature)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            window.removeEventListener("keydown", onKeyDown);
            dirty.clear();
            panel.remove();
        }
    };
};
