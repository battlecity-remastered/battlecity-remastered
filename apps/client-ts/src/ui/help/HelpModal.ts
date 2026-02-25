import type { ClientState } from "../../app/state.js";

export const buildHelpLines = (): string[] => {
    return [
        "Help",
        "F1: Toggle help",
        "F2: Toggle map",
        "M: Toggle map",
        "F3: Toggle debug",
        "F: Toggle fullscreen",
        "T: Toggle tutorial",
        "W/Up or Down: Move",
        "A or Left: Turn left",
        "Right: Turn right",
        "Shift or Space: Fire",
        "Ctrl: Rear flare burst",
        "R: Research",
        "U: Pickup item",
        "H: Use selected item",
        "C: Activate cloak",
        "D: Drop selected item",
        "S: Output city buildings (console)",
        "Mouse: click inventory slot to select item",
        "X/Delete: Hazard",
        "B: Drop armed bomb",
        "O: Drop orb on enemy command center front strip",
        "Options: H HUD, P debug, [/] overlay opacity"
    ];
};

type HelpModal = {
    render: () => void;
    dispose: () => void;
};

export const createHelpModal = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): HelpModal => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "help-modal");
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.top = "50%";
    panel.style.transform = "translate(-50%, -50%)";
    panel.style.padding = "12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(11, 14, 18, 0.9)";
    panel.style.border = "1px solid rgba(173, 230, 255, 0.7)";
    panel.style.color = "#d2f2ff";
    panel.style.font = "13px/1.5 monospace";
    panel.style.zIndex = "110";
    panel.style.pointerEvents = "none";
    panel.textContent = buildHelpLines().join("\n");
    root.appendChild(panel);

    return {
        render: () => {
            panel.style.display = state.ui.showHelpModal ? "block" : "none";
        },
        dispose: () => {
            panel.remove();
        }
    };
};
