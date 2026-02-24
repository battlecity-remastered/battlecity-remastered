import type { ClientState } from "../../app/state.js";

export const buildIntroLines = (state: ClientState): string[] => {
    return [
        "Battle City Remastered",
        "",
        `Player: ${state.local.id ?? "connecting..."}`,
        "Objective: defend your city and destroy rival orbs",
        "Enter: Start",
        "T: Toggle tutorial",
        "F1/F2/F3: Help/Map/Options",
        "F4: Build menu"
    ];
};

export const applyIntroAction = (state: ClientState, key: string): boolean => {
    if (key === "Enter" || key === "Escape") {
        state.ui.showIntroModal = false;
        return true;
    }
    if (key.toLowerCase() === "t") {
        state.ui.showTutorial = !state.ui.showTutorial;
        return true;
    }
    return false;
};

type IntroModal = {
    render: () => void;
    dispose: () => void;
};

export const createIntroModal = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): IntroModal => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "intro-modal");
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.top = "50%";
    panel.style.transform = "translate(-50%, -50%)";
    panel.style.padding = "18px 20px";
    panel.style.margin = "0";
    panel.style.background = "rgba(17, 24, 21, 0.92)";
    panel.style.border = "1px solid rgba(174, 206, 151, 0.86)";
    panel.style.color = "#ecf7db";
    panel.style.font = "14px/1.5 monospace";
    panel.style.zIndex = "130";
    panel.style.pointerEvents = "none";
    panel.style.boxShadow = "0 16px 30px rgba(0, 0, 0, 0.4)";
    root.appendChild(panel);

    return {
        render: () => {
            panel.style.display = state.ui.showIntroModal ? "block" : "none";
            if (state.ui.showIntroModal) {
                panel.textContent = buildIntroLines(state).join("\n");
            }
        },
        dispose: () => {
            panel.remove();
        }
    };
};
