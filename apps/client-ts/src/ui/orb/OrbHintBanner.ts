import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

const ORB_HINT_TTL_MS = 7000;

export const buildOrbHintLines = (
    state: ClientState,
    nowMs: number
): string[] | null => {
    const event = state.events.lastOrbEvent;
    if (!event) {
        return null;
    }
    if ((nowMs - event.at) > ORB_HINT_TTL_MS) {
        return null;
    }
    const localCity = state.local.city;
    if (event.targetCityId === localCity) {
        return [
            "Warning: Your city was orbed",
            `Attacker city: ${event.sourceCityId} | by: ${event.by}`
        ];
    }
    if (event.by === state.local.id) {
        return [
            `Orb strike successful on city ${event.targetCityId}`,
            `Awarded score: +${event.awardedScore}`
        ];
    }
    return [
        `City ${event.targetCityId} was orbed`,
        `Source city: ${event.sourceCityId}`
    ];
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

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "orb-hint");
    panel.style.position = "fixed";
    panel.style.left = "50%";
    panel.style.top = "24px";
    panel.style.transform = "translateX(-50%)";
    panel.style.padding = "8px 12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(35, 16, 16, 0.84)";
    panel.style.border = "1px solid rgba(255, 168, 140, 0.88)";
    panel.style.color = "#ffe3d6";
    panel.style.font = "12px/1.35 monospace";
    panel.style.zIndex = "125";
    panel.style.pointerEvents = "none";
    panel.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.42)";
    root.appendChild(panel);

    const dirty = createDirtyFlagTracker();
    return {
        render: () => {
            const lines = buildOrbHintLines(state, Date.now());
            panel.style.display = lines && !state.ui.showIntroModal ? "block" : "none";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const text = lines?.join("\n") ?? "";
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
