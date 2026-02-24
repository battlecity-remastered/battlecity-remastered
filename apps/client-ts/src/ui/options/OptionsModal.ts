import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import { importCityLayoutFromAsset } from "../../world/city-import.js";

export const applyOptionsAction = (
    state: ClientState,
    key: string
): boolean => {
    const normalized = key.toLowerCase();
    if (normalized === "h") {
        state.ui.showHud = !state.ui.showHud;
        return true;
    }
    if (normalized === "m") {
        state.ui.audioEnabled = !state.ui.audioEnabled;
        return true;
    }
    if (normalized === "t") {
        state.ui.showTutorial = !state.ui.showTutorial;
        return true;
    }
    if (normalized === "i") {
        state.ui.showIdentityPanel = !state.ui.showIdentityPanel;
        return true;
    }
    if (normalized === "p") {
        state.ui.showBotDebug = !state.ui.showBotDebug;
        return true;
    }
    if (normalized === "g") {
        state.identity.provider = state.identity.provider === "local" ? "google" : "local";
        state.ui.showIdentityPanel = true;
        return true;
    }
    if (normalized === ",") {
        state.ui.optionsCityImportCity = (state.ui.optionsCityImportCity + 7) % 8;
        return true;
    }
    if (normalized === ".") {
        state.ui.optionsCityImportCity = (state.ui.optionsCityImportCity + 1) % 8;
        return true;
    }
    if (normalized === "v") {
        state.ui.optionsCityImportMode = state.ui.optionsCityImportMode === "off" ? "preview" : "off";
        if (state.ui.optionsCityImportMode === "preview") {
            state.ui.optionsCityImportStatus = `Previewing slot C${state.ui.optionsCityImportCity}`;
        }
        return true;
    }
    if (normalized === "y") {
        state.ui.optionsCityImportMode = state.ui.optionsCityImportMode === "apply" ? "preview" : "apply";
        if (state.ui.optionsCityImportMode === "apply") {
            state.ui.optionsCityImportStatus = `Applying import for C${state.ui.optionsCityImportCity}...`;
        }
        return true;
    }
    if (normalized === "k") {
        state.ui.optionsPerformanceMode = state.ui.optionsPerformanceMode === "balanced"
            ? "quality"
            : state.ui.optionsPerformanceMode === "quality"
                ? "performance"
                : "balanced";
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
    const importStatus = state.ui.optionsCityImportApplying
        ? "applying..."
        : (state.ui.optionsCityImportStatus ?? "idle");
    return [
        "Options",
        `HUD: ${state.ui.showHud ? "on" : "off"} (press H)`,
        `Audio: ${state.ui.audioEnabled ? "on" : "off"} (press M)`,
        `Tutorial: ${state.ui.showTutorial ? "on" : "off"} (press T)`,
        `Identity panel: ${state.ui.showIdentityPanel ? "on" : "off"} (press I/F6)`,
        `Identity provider: ${state.identity.provider} (press G)`,
        `Bot debug: ${state.ui.showBotDebug ? "on" : "off"} (press P/F7)`,
        `Performance preset: ${state.ui.optionsPerformanceMode} (press K)`,
        `City import slot: C${state.ui.optionsCityImportCity} (press , or .)`,
        `City import mode: ${state.ui.optionsCityImportMode} (press V/Y)`,
        `City import status: ${importStatus}`,
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
    panel.style.backgroundImage = "url('/assets/imgInterface.png')";
    panel.style.backgroundSize = "cover";
    panel.style.border = "1px solid rgba(255, 198, 112, 0.75)";
    panel.style.color = "#ffe4b8";
    panel.style.font = "13px/1.5 monospace";
    panel.style.zIndex = "112";
    panel.style.pointerEvents = "none";
    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showOptionsModal ? "block" : "none";
            if (state.ui.showOptionsModal) {
                if (state.ui.optionsCityImportMode === "apply" && !state.ui.optionsCityImportApplying) {
                    state.ui.optionsCityImportApplying = true;
                    void importCityLayoutFromAsset(state, state.ui.optionsCityImportCity)
                        .then((status) => {
                            state.ui.optionsCityImportStatus = status;
                            state.ui.optionsCityImportMode = "preview";
                        })
                        .finally(() => {
                            state.ui.optionsCityImportApplying = false;
                        });
                }
                const text = buildOptionsLines(state).join("\n");
                const signature = `${panel.style.display}|${text}`;
                if (dirty.shouldRender("options-modal", signature)) {
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
