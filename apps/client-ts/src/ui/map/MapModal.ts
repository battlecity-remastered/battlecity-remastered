import type { ClientState } from "../../app/state.js";

export const buildMapLines = (state: ClientState): string[] => {
    const lines = [
        `Map - City ${state.local.city}`,
        `Player: ${state.local.id ?? "pending"}`,
        `Buildings: ${state.buildings.size}`,
        `Defenses: ${state.defenses.size}`,
        `Hazards: ${state.hazards.size}`,
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

    return {
        render: () => {
            panel.style.display = state.ui.showMapModal ? "block" : "none";
            if (state.ui.showMapModal) {
                panel.textContent = buildMapLines(state).join("\n");
            }
        },
        dispose: () => {
            panel.remove();
        }
    };
};
