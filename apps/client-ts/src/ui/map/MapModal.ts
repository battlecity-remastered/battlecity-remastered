import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const RADAR_WIDTH = 16;
const RADAR_HEIGHT = 12;
const WORLD_MAX = 24576;

const toRadarCoord = (value: number, max: number, cells: number): number => {
    const normalized = Math.min(Math.max(value, 0), max) / max;
    return Math.min(cells - 1, Math.max(0, Math.floor(normalized * cells)));
};

const buildRadarRows = (state: ClientState): string[] => {
    const grid = Array.from({ length: RADAR_HEIGHT }, () => Array.from({ length: RADAR_WIDTH }, () => "."));
    const mark = (x: number, y: number, token: string): void => {
        const rx = toRadarCoord(x, WORLD_MAX, RADAR_WIDTH);
        const ry = toRadarCoord(y, WORLD_MAX, RADAR_HEIGHT);
        grid[ry]![rx] = token;
    };

    for (const building of state.buildings.values()) {
        mark(building.tileX * 48, building.tileY * 48, "B");
    }
    for (const defense of state.defenses.values()) {
        mark(defense.tileX * 48, defense.tileY * 48, "D");
    }
    for (const hazard of state.hazards.values()) {
        mark(hazard.x, hazard.y, "H");
    }
    for (const remote of state.remotePlayers.values()) {
        mark(remote.x, remote.y, "P");
    }
    mark(state.local.x, state.local.y, "Y");
    return grid.map((row) => row.join(""));
};

export const buildMapLines = (state: ClientState): string[] => {
    const lines = [
        `Map - City ${state.local.city}`,
        `Player: ${state.local.id ?? "pending"}`,
        `Buildings: ${state.buildings.size}`,
        `Defenses: ${state.defenses.size}`,
        `Hazards: ${state.hazards.size}`,
        "Radar (Y=you,P=player,B=building,D=defense,H=hazard)",
        ...buildRadarRows(state),
        "Assignments:"
    ];
    for (const entry of state.lobby.assignments.slice(0, 8)) {
        lines.push(`C${entry.city}: mayor ${entry.mayorId ?? "-"} r${entry.recruitCount}`);
    }
    if (state.lobby.assignments.length === 0) {
        lines.push("none");
    }
    return lines;
};

type MapModal = {
    render: () => void;
    dispose: () => void;
};

export const createMapModal = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): MapModal => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "map-modal");
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.top = "50%";
    panel.style.transform = "translate(-50%, -50%)";
    panel.style.padding = "12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(7, 12, 16, 0.92)";
    panel.style.border = "1px solid rgba(130, 230, 177, 0.7)";
    panel.style.color = "#c5f2d8";
    panel.style.font = "13px/1.5 monospace";
    panel.style.zIndex = "111";
    panel.style.pointerEvents = "none";
    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showMapModal ? "block" : "none";
            if (state.ui.showMapModal) {
                const text = buildMapLines(state).join("\n");
                const signature = `${panel.style.display}|${text}`;
                if (dirty.shouldRender("map-modal", signature)) {
                    panel.textContent = text;
                }
            }
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
