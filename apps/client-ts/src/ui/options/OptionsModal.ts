import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";
import { importCityLayoutFromAsset } from "../../world/city-import.js";
import { buildOptionsLines } from "./options-actions.js";
import {
    createOptionsModalDom,
    setOptionsFormOpen,
    setOptionsSectionOpen,
    setOptionsStatus,
    type OptionsModalDom
} from "./options-modal-dom.js";
import { ensureOptionsStyles } from "./options-modal-styles.js";

export { applyOptionsAction, buildOptionsLines } from "./options-actions.js";

type OptionsModal = {
    render: () => void;
    dispose: () => void;
};

type OptionsModalContext = {
    state: ClientState;
    dom: OptionsModalDom;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

type OptionsModalHandlers = {
    onOverlayClick: (event: MouseEvent) => void;
    onCloseClick: () => void;
    onSectionHeaderClick: () => void;
    onRevealClick: () => void;
    onLoadClick: () => void;
    onEditorKeyDown: (event: KeyboardEvent) => void;
};

const applyOptionsCityImport = (context: OptionsModalContext): void => {
    if (context.state.ui.optionsCityImportApplying) {
        return;
    }
    context.state.ui.optionsCityImportApplying = true;
    context.state.ui.optionsCityImportStatus = `Applying import for C${context.state.ui.optionsCityImportCity}...`;
    setOptionsStatus(context.dom, context.state.ui.optionsCityImportStatus);
    void importCityLayoutFromAsset(context.state, context.state.ui.optionsCityImportCity)
        .then((importStatus) => {
            context.state.ui.optionsCityImportStatus = importStatus;
            context.state.ui.optionsCityImportMode = "preview";
            setOptionsStatus(context.dom, importStatus);
        })
        .finally(() => {
            context.state.ui.optionsCityImportApplying = false;
        });
};

const resolveImportStatus = (state: ClientState): string => {
    if (state.ui.optionsCityImportApplying) {
        return "applying...";
    }
    return state.ui.optionsCityImportStatus ?? "idle";
};

const renderOptionsModalState = (context: OptionsModalContext): void => {
    const { state, dom, dirty } = context;
    dom.overlay.style.display = state.ui.showOptionsModal ? "flex" : "none";
    if (!state.ui.showOptionsModal) {
        return;
    }
    if (state.ui.optionsCityImportMode === "apply" && !state.ui.optionsCityImportApplying) {
        applyOptionsCityImport(context);
    }
    const importStatus = resolveImportStatus(state);
    const helperText = `Current slot: C${state.ui.optionsCityImportCity}. Keyboard: ,/. slot, V preview, Y apply.`;
    const summaryText = buildOptionsLines(state).join("\n");
    const signature = `${dom.overlay.style.display}|${importStatus}|${state.ui.optionsCityImportCity}|${state.ui.optionsPerformanceMode}|${state.ui.overlaysOpacity}|${summaryText}`;
    if (!dirty.shouldRender("options-modal", signature)) {
        return;
    }
    dom.badge.textContent = `City Import C${state.ui.optionsCityImportCity}`;
    dom.helper.textContent = helperText;
    dom.summary.textContent = summaryText;
    dom.loadButton.disabled = state.ui.optionsCityImportApplying;
    dom.loadButton.style.opacity = state.ui.optionsCityImportApplying ? "0.7" : "1";
    dom.loadButton.textContent = state.ui.optionsCityImportApplying ? "Loading..." : "Load Map";
    setOptionsStatus(dom, `Status: ${importStatus}`);
};

const disposeOptionsModal = (context: OptionsModalContext, handlers: OptionsModalHandlers): void => {
    const { dom, dirty } = context;
    dirty.clear();
    dom.overlay.removeEventListener("click", handlers.onOverlayClick);
    dom.closeButton.removeEventListener("click", handlers.onCloseClick);
    dom.sectionHeader.removeEventListener("click", handlers.onSectionHeaderClick);
    dom.revealButton.removeEventListener("click", handlers.onRevealClick);
    dom.loadButton.removeEventListener("click", handlers.onLoadClick);
    dom.textArea.removeEventListener("keydown", handlers.onEditorKeyDown);
    dom.loadButton.removeEventListener("keydown", handlers.onEditorKeyDown);
    dom.revealButton.removeEventListener("keydown", handlers.onEditorKeyDown);
    dom.overlay.remove();
};

const createOptionsModalHandlers = (context: OptionsModalContext): OptionsModalHandlers => {
    return {
        onOverlayClick: (event) => {
            if (event.target === context.dom.overlay) {
                context.state.ui.showOptionsModal = false;
            }
        },
        onCloseClick: () => {
            context.state.ui.showOptionsModal = false;
        },
        onSectionHeaderClick: () => {
            const open = context.dom.sectionBody.dataset.open === "true";
            setOptionsSectionOpen(context.dom, !open);
        },
        onRevealClick: () => {
            setOptionsFormOpen(context.dom, true);
        },
        onLoadClick: () => {
            context.state.ui.optionsCityImportMode = "apply";
            if (context.dom.textArea.value.trim().length > 0) {
                setOptionsStatus(context.dom, `Applying selected slot C${context.state.ui.optionsCityImportCity} (JSON parsing not required in TS parity mode).`);
            }
        },
        onEditorKeyDown: (event) => {
            event.stopPropagation();
        }
    };
};

const attachOptionsModalListeners = (dom: OptionsModalDom, handlers: OptionsModalHandlers): void => {
    dom.overlay.addEventListener("click", handlers.onOverlayClick);
    dom.closeButton.addEventListener("click", handlers.onCloseClick);
    dom.sectionHeader.addEventListener("click", handlers.onSectionHeaderClick);
    dom.revealButton.addEventListener("click", handlers.onRevealClick);
    dom.loadButton.addEventListener("click", handlers.onLoadClick);
    dom.textArea.addEventListener("keydown", handlers.onEditorKeyDown);
    dom.loadButton.addEventListener("keydown", handlers.onEditorKeyDown);
    dom.revealButton.addEventListener("keydown", handlers.onEditorKeyDown);
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
    const dom = createOptionsModalDom(root);
    const context: OptionsModalContext = {
        state,
        dom,
        dirty: createDirtyFlagTracker()
    };
    const handlers = createOptionsModalHandlers(context);
    attachOptionsModalListeners(dom, handlers);

    return {
        render: () => {
            renderOptionsModalState(context);
        },
        dispose: () => {
            disposeOptionsModal(context, handlers);
        }
    };
};
