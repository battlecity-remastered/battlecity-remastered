import type { ClientState } from "../../app/state.js";

export const applyOptionsAction = (
    state: ClientState,
    key: string
): boolean => {
    const normalized = key.toLowerCase();
    if (normalized === "h") {
        state.ui.showHud = !state.ui.showHud;
        return true;
    }
    if (normalized === "[" || normalized === "{" ) {
        state.ui.overlaysOpacity = Math.max(0.25, Number((state.ui.overlaysOpacity - 0.1).toFixed(2)));
        return true;
    }
    if (normalized === "]" || normalized === "}") {
        state.ui.overlaysOpacity = Math.min(1, Number((state.ui.overlaysOpacity + 0.1).toFixed(2)));
        return true;
    }
    return false;
};

export const buildOptionsLines = (state: ClientState): string[] => {
    return [
        "Options",
        `HUD: ${state.ui.showHud ? "on" : "off"} (press H)`,
        `Overlay opacity: ${state.ui.overlaysOpacity.toFixed(2)} (press [ or ])`,
        "Close: F3"
    ];
};

type OptionsModal = {
    render: () => void;
    dispose: () => void;
};

export const createOptionsModal = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): OptionsModal => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "options-modal");
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.top = "50%";
    panel.style.transform = "translate(-50%, -50%)";
    panel.style.padding = "12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(17, 12, 9, 0.92)";
    panel.style.border = "1px solid rgba(255, 198, 112, 0.75)";
    panel.style.color = "#ffe4b8";
    panel.style.font = "13px/1.5 monospace";
    panel.style.zIndex = "112";
    panel.style.pointerEvents = "none";
    root.appendChild(panel);

    return {
        render: () => {
            panel.style.display = state.ui.showOptionsModal ? "block" : "none";
            if (state.ui.showOptionsModal) {
                panel.textContent = buildOptionsLines(state).join("\n");
            }
        },
        dispose: () => {
            panel.remove();
        }
    };
};
