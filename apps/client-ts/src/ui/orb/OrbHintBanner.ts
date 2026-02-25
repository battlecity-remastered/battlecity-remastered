import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import { formatNearestOrbableCityLine, resolveNearestOrbableCity } from "../../render/orb-target.js";

export const buildOrbHintText = (state: ClientState): string => {
    if (state.local.id === null) {
        return "";
    }
    return formatNearestOrbableCityLine(resolveNearestOrbableCity(state));
};

type OrbHintBanner = {
    render: () => void;
    dispose: () => void;
};

export const createOrbHintBanner = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): OrbHintBanner => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("div");
    panel.setAttribute("data-ui", "orb-hint");
    panel.style.position = "fixed";
    panel.style.top = "8px";
    panel.style.left = "8px";
    panel.style.padding = "10px 14px";
    panel.style.borderRadius = "12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(10, 18, 52, 0.82)";
    panel.style.border = "1px solid rgba(123, 152, 255, 0.35)";
    panel.style.boxShadow = "0 18px 36px rgba(0, 0, 0, 0.45)";
    panel.style.fontFamily = "\"Segoe UI\", Tahoma, Geneva, Verdana, sans-serif";
    panel.style.fontSize = "14px";
    panel.style.color = "#f0f6ff";
    panel.style.letterSpacing = "0.3px";
    panel.style.maxWidth = "320px";
    panel.style.zIndex = "1000";
    panel.style.pointerEvents = "none";
    root.appendChild(panel);

    const dirty = createDirtyFlagTracker();
    return {
        render: () => {
            const text = buildOrbHintText(state);
            panel.style.display = text && !state.ui.showIntroModal ? "block" : "none";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("orb-hint", signature)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
