import type { ClientState } from "../../app/state.js";
import { toggleDebugMode } from "../../app/debug-metrics.js";

type OptionsActionHandler = (state: ClientState) => void;

const cyclePerformanceMode = (mode: ClientState["ui"]["optionsPerformanceMode"]): ClientState["ui"]["optionsPerformanceMode"] => {
    if (mode === "balanced") {
        return "quality";
    }
    if (mode === "quality") {
        return "performance";
    }
    return "balanced";
};

const adjustOverlayOpacity = (state: ClientState, delta: number): void => {
    const next = Number((state.ui.overlaysOpacity + delta).toFixed(2));
    state.ui.overlaysOpacity = Math.max(0.25, Math.min(1, next));
};

const setCityImportMode = (state: ClientState, mode: "off" | "preview" | "apply"): void => {
    state.ui.optionsCityImportMode = mode;
    if (mode === "preview") {
        state.ui.optionsCityImportStatus = `Previewing slot C${state.ui.optionsCityImportCity}`;
    }
    if (mode === "apply") {
        state.ui.optionsCityImportStatus = `Applying import for C${state.ui.optionsCityImportCity}...`;
    }
};

const togglePreviewMode = (state: ClientState): void => {
    setCityImportMode(state, state.ui.optionsCityImportMode === "off" ? "preview" : "off");
};

const toggleApplyMode = (state: ClientState): void => {
    setCityImportMode(state, state.ui.optionsCityImportMode === "apply" ? "preview" : "apply");
};

const OPTIONS_ACTION_HANDLERS: Readonly<Record<string, OptionsActionHandler>> = {
    h: (state) => { state.ui.showHud = !state.ui.showHud; },
    m: (state) => { state.ui.audioEnabled = !state.ui.audioEnabled; },
    t: (state) => { state.ui.showTutorial = !state.ui.showTutorial; },
    i: (state) => { state.ui.showIdentityPanel = !state.ui.showIdentityPanel; },
    p: toggleDebugMode,
    g: (state) => {
        state.identity.provider = state.identity.provider === "local" ? "google" : "local";
        state.ui.showIdentityPanel = true;
    },
    ",": (state) => { state.ui.optionsCityImportCity = (state.ui.optionsCityImportCity + 7) % 8; },
    ".": (state) => { state.ui.optionsCityImportCity = (state.ui.optionsCityImportCity + 1) % 8; },
    v: togglePreviewMode,
    y: toggleApplyMode,
    k: (state) => { state.ui.optionsPerformanceMode = cyclePerformanceMode(state.ui.optionsPerformanceMode); },
    "[": (state) => { adjustOverlayOpacity(state, -0.1); },
    "{": (state) => { adjustOverlayOpacity(state, -0.1); },
    "]": (state) => { adjustOverlayOpacity(state, 0.1); },
    "}": (state) => { adjustOverlayOpacity(state, 0.1); }
};

export const applyOptionsAction = (
    state: ClientState,
    key: string
): boolean => {
    const handler = OPTIONS_ACTION_HANDLERS[key.toLowerCase()];
    if (!handler) {
        return false;
    }
    handler(state);
    return true;
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
        `Debug mode: ${state.ui.showBotDebug ? "on" : "off"} (press P/F3)`,
        `Performance preset: ${state.ui.optionsPerformanceMode} (press K)`,
        `City import slot: C${state.ui.optionsCityImportCity} (press , or .)`,
        `City import mode: ${state.ui.optionsCityImportMode} (press V/Y)`,
        `City import status: ${importStatus}`,
        `Overlay opacity: ${state.ui.overlaysOpacity.toFixed(2)} (press [ or ])`,
        "Close: panel button"
    ];
};
