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
        `Bot debug: ${state.ui.showBotDebug ? "on" : "off"} (press P/F3)`,
        `Performance preset: ${state.ui.optionsPerformanceMode} (press K)`,
        `City import slot: C${state.ui.optionsCityImportCity} (press , or .)`,
        `City import mode: ${state.ui.optionsCityImportMode} (press V/Y)`,
        `City import status: ${importStatus}`,
        `Overlay opacity: ${state.ui.overlaysOpacity.toFixed(2)} (press [ or ])`,
        "Close: panel button"
    ];
};

const OPTIONS_STYLE_ID = "battlecity-options-styles";

const ensureOptionsStyles = (): void => {
    if (typeof document === "undefined") {
        return;
    }
    if (document.getElementById(OPTIONS_STYLE_ID)) {
        return;
    }
    const style = document.createElement("style");
    style.id = OPTIONS_STYLE_ID;
    style.textContent = `
        .battlecity-options-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 15000;
            padding: 24px;
        }
        .battlecity-options-panel {
            width: min(620px, 100%);
            max-height: calc(100vh - 40px);
            background: linear-gradient(150deg, rgba(8, 12, 26, 0.96) 0%, rgba(14, 22, 50, 0.94) 55%, rgba(12, 33, 68, 0.9) 100%);
            border: 1px solid rgba(123, 182, 255, 0.45);
            box-shadow: 0 24px 56px rgba(0, 0, 0, 0.65);
            border-radius: 18px;
            padding: 26px 30px 22px;
            color: #f5f7ff;
            font-family: "Rajdhani", "Segoe UI", Tahoma, sans-serif;
            display: flex;
            flex-direction: column;
            gap: 14px;
            position: relative;
            overflow: hidden;
        }
        .battlecity-options-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 14px;
        }
        .battlecity-options-title {
            margin: 0;
            font-size: 22px;
            font-weight: 800;
            letter-spacing: 0.6px;
            text-transform: uppercase;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .battlecity-options-badge {
            font-size: 11px;
            letter-spacing: 0.6px;
            background: rgba(255, 255, 255, 0.12);
            color: #c7ddff;
            padding: 6px 10px;
            border-radius: 999px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            text-transform: uppercase;
        }
        .battlecity-options-close,
        .battlecity-options-action,
        .battlecity-options-reveal {
            border: none;
            background: linear-gradient(135deg, rgba(110, 179, 255, 0.9), rgba(83, 141, 255, 0.95));
            color: #071021;
            font-size: 14px;
            padding: 10px 16px;
            border-radius: 12px;
            cursor: pointer;
            font-weight: 700;
            letter-spacing: 0.2px;
            box-shadow: 0 12px 24px rgba(47, 120, 255, 0.35);
            transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease, opacity 0.2s ease;
        }
        .battlecity-options-close {
            background: rgba(255, 255, 255, 0.08);
            color: #f5f7ff;
            box-shadow: none;
        }
        .battlecity-options-close:hover {
            background: rgba(255, 255, 255, 0.14);
        }
        .battlecity-options-close:active {
            transform: translateY(1px);
        }
        .battlecity-options-action:hover,
        .battlecity-options-reveal:hover {
            box-shadow: 0 14px 28px rgba(68, 152, 255, 0.4);
        }
        .battlecity-options-action:active,
        .battlecity-options-reveal:active {
            transform: translateY(1px);
        }
        .battlecity-options-body {
            display: grid;
            gap: 14px;
        }
        .battlecity-options-section {
            border: 1px solid rgba(123, 182, 255, 0.32);
            border-radius: 16px;
            background: rgba(16, 24, 46, 0.75);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
            overflow: hidden;
        }
        .battlecity-options-sectionHeader {
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 10px;
            padding: 12px 14px 12px 16px;
            background: rgba(255, 255, 255, 0.02);
            border: none;
            color: #f5f7ff;
            cursor: pointer;
            text-align: left;
            transition: background 0.15s ease, transform 0.1s ease;
        }
        .battlecity-options-sectionHeader:hover {
            background: rgba(255, 255, 255, 0.05);
        }
        .battlecity-options-sectionHeader:active {
            transform: translateY(1px);
        }
        .battlecity-options-sectionTitle {
            margin: 0;
            font-size: 16px;
            font-weight: 800;
            letter-spacing: 0.3px;
            text-transform: uppercase;
        }
        .battlecity-options-sectionSubtitle {
            display: block;
            margin-top: 2px;
            font-size: 12px;
            color: rgba(220, 232, 255, 0.85);
            letter-spacing: 0.15px;
        }
        .battlecity-options-sectionTitle span {
            display: block;
        }
        .battlecity-options-chevron {
            font-size: 18px;
            transition: transform 0.2s ease, opacity 0.2s ease;
            opacity: 0.8;
        }
        .battlecity-options-sectionHeader[aria-expanded="true"] .battlecity-options-chevron {
            transform: rotate(180deg);
        }
        .battlecity-options-sectionBody {
            display: grid;
            gap: 12px;
            padding: 0 14px 0 16px;
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            pointer-events: none;
            transition: max-height 0.25s ease, opacity 0.25s ease, padding 0.25s ease;
        }
        .battlecity-options-sectionBody[data-open="true"] {
            max-height: 1100px;
            opacity: 1;
            pointer-events: auto;
            padding: 12px 14px 14px 16px;
        }
        .battlecity-options-lead {
            margin: 0;
            font-size: 14px;
            color: rgba(235, 241, 255, 0.92);
            line-height: 1.5;
        }
        .battlecity-options-steps {
            list-style: none;
            margin: 0;
            padding: 10px 12px;
            display: grid;
            gap: 6px;
            border: 1px solid rgba(123, 182, 255, 0.32);
            border-radius: 14px;
            background: rgba(16, 24, 46, 0.8);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.04);
        }
        .battlecity-options-steps li {
            font-size: 13px;
            color: rgba(230, 237, 255, 0.88);
            padding-left: 16px;
            position: relative;
        }
        .battlecity-options-steps li::before {
            content: "•";
            position: absolute;
            left: 0;
            color: #8ac2ff;
            font-weight: 700;
        }
        .battlecity-options-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            align-items: center;
        }
        .battlecity-options-form {
            display: grid;
            gap: 10px;
            align-items: stretch;
            padding: 12px 12px 2px;
            border-radius: 12px;
            border: 1px solid rgba(123, 182, 255, 0.28);
            background: rgba(11, 16, 32, 0.9);
            box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.03);
            max-height: 0;
            opacity: 0;
            overflow: hidden;
            pointer-events: none;
            transition: max-height 0.25s ease, opacity 0.25s ease;
        }
        .battlecity-options-form[data-open="true"] {
            max-height: 540px;
            opacity: 1;
            pointer-events: auto;
            padding-bottom: 12px;
        }
        .battlecity-options-textarea {
            width: 100%;
            min-height: 200px;
            border-radius: 12px;
            border: 1px solid rgba(145, 196, 255, 0.55);
            background: rgba(16, 22, 36, 0.92);
            color: #e9ecff;
            padding: 12px;
            font-size: 13px;
            resize: vertical;
            font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
            box-shadow: 0 6px 22px rgba(0, 0, 0, 0.35);
            box-sizing: border-box;
            width: 100%;
            max-width: 100%;
        }
        .battlecity-options-helper {
            font-size: 12px;
            color: rgba(200, 210, 235, 0.9);
            line-height: 1.5;
        }
        .battlecity-options-status {
            font-size: 12px;
            color: #bcd8ff;
            min-height: 18px;
            padding: 6px 0 2px;
        }
        .battlecity-options-summary {
            margin: 0;
            white-space: pre-wrap;
            font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
            font-size: 11px;
            line-height: 1.45;
            color: rgba(216, 228, 255, 0.9);
            background: rgba(10, 16, 31, 0.75);
            border: 1px solid rgba(123, 182, 255, 0.18);
            border-radius: 12px;
            padding: 10px;
        }
    `;
    document.head.appendChild(style);
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

    ensureOptionsStyles();
    const overlay = document.createElement("div");
    overlay.className = "battlecity-options-overlay";
    overlay.setAttribute("data-ui", "options-modal");

    const panel = document.createElement("div");
    panel.className = "battlecity-options-panel";

    const header = document.createElement("div");
    header.className = "battlecity-options-header";

    const title = document.createElement("h2");
    title.className = "battlecity-options-title";
    title.textContent = "Options";

    const badge = document.createElement("span");
    badge.className = "battlecity-options-badge";
    badge.textContent = "City Import";

    const closeButton = document.createElement("button");
    closeButton.className = "battlecity-options-close";
    closeButton.type = "button";
    closeButton.textContent = "Close";

    title.appendChild(badge);
    header.appendChild(title);
    header.appendChild(closeButton);

    const body = document.createElement("div");
    body.className = "battlecity-options-body";

    const section = document.createElement("div");
    section.className = "battlecity-options-section";

    const sectionHeader = document.createElement("button");
    sectionHeader.className = "battlecity-options-sectionHeader";
    sectionHeader.type = "button";
    sectionHeader.setAttribute("aria-expanded", "true");

    const sectionTitle = document.createElement("div");
    sectionTitle.className = "battlecity-options-sectionTitle";
    sectionTitle.innerHTML = "<span>City import</span><span class=\"battlecity-options-sectionSubtitle\">Replace your city layout from a builder export</span>";

    const chevron = document.createElement("span");
    chevron.className = "battlecity-options-chevron";
    chevron.innerHTML = "&#9662;";

    sectionHeader.appendChild(sectionTitle);
    sectionHeader.appendChild(chevron);

    const sectionBody = document.createElement("div");
    sectionBody.className = "battlecity-options-sectionBody";
    sectionBody.dataset.open = "true";

    const lead = document.createElement("p");
    lead.className = "battlecity-options-lead";
    lead.textContent = "Import a city layout for the selected city slot. This mirrors the legacy options panel flow while keeping TypeScript parity import controls.";

    const steps = document.createElement("ul");
    steps.className = "battlecity-options-steps";
    [
        "Pick your city slot with , and . keys.",
        "Press Paste JSON to reveal import controls.",
        "Click Load Map to import the selected slot asset."
    ].forEach((text) => {
        const item = document.createElement("li");
        item.textContent = text;
        steps.appendChild(item);
    });

    const actionsRow = document.createElement("div");
    actionsRow.className = "battlecity-options-actions";

    const revealButton = document.createElement("button");
    revealButton.className = "battlecity-options-reveal";
    revealButton.type = "button";
    revealButton.textContent = "Paste JSON";

    actionsRow.appendChild(revealButton);

    const formSection = document.createElement("div");
    formSection.className = "battlecity-options-form";
    formSection.dataset.open = "false";

    const textArea = document.createElement("textarea");
    textArea.className = "battlecity-options-textarea";
    textArea.placeholder = "{ \"layout\": [...], \"defenses\": [...] }";

    const helper = document.createElement("div");
    helper.className = "battlecity-options-helper";

    const actionRow = document.createElement("div");
    actionRow.style.display = "flex";
    actionRow.style.justifyContent = "flex-end";

    const loadButton = document.createElement("button");
    loadButton.className = "battlecity-options-action";
    loadButton.type = "button";
    loadButton.textContent = "Load Map";

    actionRow.appendChild(loadButton);

    const status = document.createElement("div");
    status.className = "battlecity-options-status";

    const summary = document.createElement("pre");
    summary.className = "battlecity-options-summary";

    formSection.appendChild(textArea);
    formSection.appendChild(helper);
    formSection.appendChild(actionRow);
    formSection.appendChild(status);

    sectionBody.appendChild(lead);
    sectionBody.appendChild(steps);
    sectionBody.appendChild(actionsRow);
    sectionBody.appendChild(formSection);
    sectionBody.appendChild(summary);

    section.appendChild(sectionHeader);
    section.appendChild(sectionBody);
    body.appendChild(section);

    panel.appendChild(header);
    panel.appendChild(body);
    overlay.appendChild(panel);
    root.appendChild(overlay);

    const setSectionOpen = (isOpen: boolean): void => {
        sectionBody.dataset.open = isOpen ? "true" : "false";
        sectionHeader.setAttribute("aria-expanded", isOpen ? "true" : "false");
    };

    const setFormOpen = (isOpen: boolean): void => {
        if (isOpen) {
            setSectionOpen(true);
        }
        formSection.dataset.open = isOpen ? "true" : "false";
        revealButton.disabled = isOpen;
        revealButton.style.opacity = isOpen ? "0.7" : "1";
        if (isOpen) {
            textArea.focus();
        }
    };

    const setStatus = (message: string): void => {
        status.textContent = message;
    };

    const applyCityImport = (): void => {
        if (state.ui.optionsCityImportApplying) {
            return;
        }
        state.ui.optionsCityImportApplying = true;
        state.ui.optionsCityImportStatus = `Applying import for C${state.ui.optionsCityImportCity}...`;
        setStatus(state.ui.optionsCityImportStatus);
        void importCityLayoutFromAsset(state, state.ui.optionsCityImportCity)
            .then((importStatus) => {
                state.ui.optionsCityImportStatus = importStatus;
                state.ui.optionsCityImportMode = "preview";
                setStatus(importStatus);
            })
            .finally(() => {
                state.ui.optionsCityImportApplying = false;
            });
    };

    const onOverlayClick = (event: MouseEvent): void => {
        if (event.target === overlay) {
            state.ui.showOptionsModal = false;
        }
    };

    const onCloseClick = (): void => {
        state.ui.showOptionsModal = false;
    };

    const onSectionHeaderClick = (): void => {
        const open = sectionBody.dataset.open === "true";
        setSectionOpen(!open);
    };

    const onRevealClick = (): void => {
        setFormOpen(true);
    };

    const onLoadClick = (): void => {
        state.ui.optionsCityImportMode = "apply";
        if (textArea.value.trim().length > 0) {
            setStatus(`Applying selected slot C${state.ui.optionsCityImportCity} (JSON parsing not required in TS parity mode).`);
        }
    };

    const onEditorKeyDown = (event: KeyboardEvent): void => {
        event.stopPropagation();
    };

    overlay.addEventListener("click", onOverlayClick);
    closeButton.addEventListener("click", onCloseClick);
    sectionHeader.addEventListener("click", onSectionHeaderClick);
    revealButton.addEventListener("click", onRevealClick);
    loadButton.addEventListener("click", onLoadClick);
    textArea.addEventListener("keydown", onEditorKeyDown);
    loadButton.addEventListener("keydown", onEditorKeyDown);
    revealButton.addEventListener("keydown", onEditorKeyDown);

    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            overlay.style.display = state.ui.showOptionsModal ? "flex" : "none";
            if (state.ui.showOptionsModal) {
                if (state.ui.optionsCityImportMode === "apply" && !state.ui.optionsCityImportApplying) {
                    applyCityImport();
                }
                const importStatus = state.ui.optionsCityImportApplying
                    ? "applying..."
                    : (state.ui.optionsCityImportStatus ?? "idle");
                const helperText = `Current slot: C${state.ui.optionsCityImportCity}. Keyboard: ,/. slot, V preview, Y apply.`;
                const summaryText = buildOptionsLines(state).join("\n");
                const signature = `${overlay.style.display}|${importStatus}|${state.ui.optionsCityImportCity}|${state.ui.optionsPerformanceMode}|${state.ui.overlaysOpacity}|${summaryText}`;
                if (dirty.shouldRender("options-modal", signature)) {
                    badge.textContent = `City Import C${state.ui.optionsCityImportCity}`;
                    helper.textContent = helperText;
                    summary.textContent = summaryText;
                    loadButton.disabled = state.ui.optionsCityImportApplying;
                    loadButton.style.opacity = state.ui.optionsCityImportApplying ? "0.7" : "1";
                    loadButton.textContent = state.ui.optionsCityImportApplying ? "Loading..." : "Load Map";
                    setStatus(`Status: ${importStatus}`);
                }
            }
        },
        dispose: () => {
            dirty.clear();
            overlay.removeEventListener("click", onOverlayClick);
            closeButton.removeEventListener("click", onCloseClick);
            sectionHeader.removeEventListener("click", onSectionHeaderClick);
            revealButton.removeEventListener("click", onRevealClick);
            loadButton.removeEventListener("click", onLoadClick);
            textArea.removeEventListener("keydown", onEditorKeyDown);
            loadButton.removeEventListener("keydown", onEditorKeyDown);
            revealButton.removeEventListener("keydown", onEditorKeyDown);
            overlay.remove();
        }
    };
};
