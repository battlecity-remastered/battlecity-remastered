import type { ClientState } from "../../app/state.js";
import { applyOptionsAction } from "../options/OptionsModal.js";

export const applyModalToggle = (state: ClientState, key: string): boolean => {
    if (key === "F1") {
        state.ui.showHelpModal = !state.ui.showHelpModal;
        if (state.ui.showHelpModal) {
            state.ui.showMapModal = false;
            state.ui.showOptionsModal = false;
        }
        return true;
    }
    if (key === "F2") {
        state.ui.showMapModal = !state.ui.showMapModal;
        if (state.ui.showMapModal) {
            state.ui.showHelpModal = false;
            state.ui.showOptionsModal = false;
        }
        return true;
    }
    if (key === "F3") {
        state.ui.showOptionsModal = !state.ui.showOptionsModal;
        if (state.ui.showOptionsModal) {
            state.ui.showHelpModal = false;
            state.ui.showMapModal = false;
        }
        return true;
    }
    if (state.ui.showOptionsModal) {
        return applyOptionsAction(state, key);
    }
    return false;
};

export const registerModalHotkeys = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        const handled = applyModalToggle(state, event.key);
        if (handled) {
            event.preventDefault();
        }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
};
