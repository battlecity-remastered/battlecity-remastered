import type { ClientState } from "../../app/state.js";

export const buildTutorialLines = (state: ClientState): string[] => {
    const canBuild = state.local.id ? "yes" : "no";
    return [
        "Tutorial",
        "1. Join a city and move with W/A/D (or arrows).",
        "2. Hold Ctrl+B to place a building at cursor tile.",
        "3. Press C to collect factory stock, U to use medkit.",
        "4. Press B to orb enemy city, Shift+B to deploy defense.",
        `Ready: ${canBuild}`,
        "Toggle: T"
    ];
};

export const applyTutorialToggle = (state: ClientState, key: string): boolean => {
    if (key.toLowerCase() !== "t") {
        return false;
    }
    state.ui.showTutorial = !state.ui.showTutorial;
    state.ui.showIntroModal = false;
    return true;
};

type TutorialManager = {
    render: () => void;
    dispose: () => void;
};

export const createTutorialManager = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): TutorialManager => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "tutorial");
    panel.style.position = "fixed";
    panel.style.right = "12px";
    panel.style.bottom = "180px";
    panel.style.padding = "10px";
    panel.style.margin = "0";
    panel.style.background = "rgba(8, 12, 9, 0.76)";
    panel.style.border = "1px solid rgba(171, 239, 154, 0.6)";
    panel.style.color = "#d7fbd0";
    panel.style.font = "12px/1.4 monospace";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "95";
    root.appendChild(panel);

    return {
        render: () => {
            panel.style.display = state.ui.showTutorial ? "block" : "none";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            if (state.ui.showTutorial) {
                panel.textContent = buildTutorialLines(state).join("\n");
            }
        },
        dispose: () => {
            panel.remove();
        }
    };
};
