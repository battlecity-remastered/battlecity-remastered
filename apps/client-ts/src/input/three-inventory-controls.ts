const isDropShortcut = (key: string, shifted: boolean): boolean => key === "d" || key === "g" || ((key === "x" || key === "h") && shifted);
import type { ClientState } from "../app/state.js";
import { isInteractiveKeyboardTarget } from "./interactive-target.js";

type InventoryActions = {
    cycle: (direction: -1 | 1) => void;
    drop: () => void;
    use: (type: number) => void;
    changed: () => void;
};

// The classic cargo shortcuts take priority over driving (D is drop, B is bomb).
// U stays held until release so approaching an icon while holding U still works.
export const createThreeInventoryControls = (getState: () => ClientState | undefined, actions: InventoryActions) => {
    let collectHeld = false, collectOnce = false, lastCollect = -Infinity;
    const toggleBomb = (state: ClientState): void => {
        if (state.ui.selectedInventoryItemType === 3 && (state.inventory.get(3) ?? 0) > 0) {
            state.ui.bombArmed = !state.ui.bombArmed; actions.changed();
        }
    };
    const dropShortcut = (state: ClientState, type: number, armed: boolean): void => {
        if ((state.inventory.get(type) ?? 0) > 0) {
            state.ui.selectedInventoryItemType = type; state.ui.bombArmed = armed; actions.drop();
        }
    };
    const dispatchShortcut = (key: string, shiftKey: boolean, state: ClientState): boolean => {
        if (key === "q" || key === "e") actions.cycle(key === "q" ? -1 : 1);
        else if (isDropShortcut(key, shiftKey)) actions.drop();
        else if (key === "v") toggleBomb(state);
        else if (key === "b") dropShortcut(state, 3, true); else if (key === "c" || key === "h") actions.use(key === "c" ? 0 : 2);
        else if (key === "o" && !shiftKey) dropShortcut(state, 5, false);
        else return false;
        return true;
    };
    return {
        keyDown(event: KeyboardEvent): boolean {
            const state = getState();
            if (!state?.local.id || event.ctrlKey || event.metaKey || event.altKey || isInteractiveKeyboardTarget(event)) return false;
            const key = event.key.toLowerCase();
            if (key === "u") { collectHeld = true; if (!event.repeat) collectOnce = true; return true; }
            if (event.repeat) return ["q", "e", "d", "g", "v", "b", "c", "h", "o"].includes(key) || (key === "x" && event.shiftKey);
            return dispatchShortcut(key, event.shiftKey, state);
        },
        keyUp(event: KeyboardEvent): void { if (event.key.toLowerCase() === "u") collectHeld = false; },
        reset(): void { collectHeld = collectOnce = false; },
        requestCollect(): void { collectOnce = true; },
        collectRequested(now: number): boolean {
            if (!collectOnce && (!collectHeld || now - lastCollect < 800)) return false;
            collectOnce = false; lastCollect = now; return true;
        }
    };
};
