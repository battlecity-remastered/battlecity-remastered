import type { ClientState } from "../../app/state.js";
import { buildDebugHudLines } from "../../app/debug-metrics.js";

type DebugHud = {
    render: () => void;
    dispose: () => void;
};

const HUD_REFRESH_INTERVAL_MS = 250;

export const createDebugHud = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined"
        ? null
        : (document.getElementById("app") ?? document.body)
): DebugHud => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "debug-hud");
    panel.style.position = "fixed";
    panel.style.right = "8px";
    panel.style.bottom = "8px";
    panel.style.padding = "6px 8px";
    panel.style.margin = "0";
    panel.style.font = "12px 'Courier New', monospace";
    panel.style.background = "rgba(0, 0, 0, 0.6)";
    panel.style.color = "#b0fffe";
    panel.style.border = "1px solid rgba(255, 255, 255, 0.2)";
    panel.style.borderRadius = "4px";
    panel.style.pointerEvents = "none";
    panel.style.whiteSpace = "pre";
    panel.style.zIndex = "150";
    panel.style.display = "none";
    root.appendChild(panel);

    let lastText = "";
    let lastVisible = false;
    let lastRefreshAt = 0;

    return {
        render: () => {
            const visible = state.ui.showBotDebug;
            if (visible !== lastVisible) {
                panel.style.display = visible ? "block" : "none";
                lastVisible = visible;
                lastRefreshAt = 0;
            }
            if (!visible) {
                return;
            }
            const now = Date.now();
            if (lastRefreshAt !== 0 && (now - lastRefreshAt) < HUD_REFRESH_INTERVAL_MS) {
                return;
            }
            const text = buildDebugHudLines(state, now).join("\n");
            if (text !== lastText) {
                panel.textContent = text;
                lastText = text;
            }
            lastRefreshAt = now;
        },
        dispose: () => {
            panel.remove();
        }
    };
};
