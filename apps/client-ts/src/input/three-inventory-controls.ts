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
    return {
        keyDown(event: KeyboardEvent): boolean {
            const state = getState();
            if (!state?.local.id || event.ctrlKey || event.metaKey || event.altKey || isInteractiveKeyboardTarget(event)) return false;
            const key = event.key.toLowerCase();
            if (key === "u") { collectHeld = true; if (!event.repeat) collectOnce = true; return true; }
            if (event.repeat) return ["q", "e", "d", "g", "v", "b", "c", "h", "o"].includes(key) || (key === "x" && event.shiftKey);
            if (key === "q" || key === "e") actions.cycle(key === "q" ? -1 : 1);
            else if (key === "d" || key === "g" || ((key === "x" || key === "h") && event.shiftKey)) actions.drop();
            else if (key === "v") {
                if (state.ui.selectedInventoryItemType === 3 && (state.inventory.get(3) ?? 0) > 0) {
                    state.ui.bombArmed = !state.ui.bombArmed; actions.changed();
                }
            } else if (key === "b") {
                if ((state.inventory.get(3) ?? 0) > 0) { state.ui.selectedInventoryItemType = 3; state.ui.bombArmed = true; actions.drop(); }
            } else if (key === "c" || key === "h") actions.use(key === "c" ? 0 : 2);
            else if (key === "o" && !event.shiftKey) { if ((state.inventory.get(5) ?? 0) > 0) {state.ui.selectedInventoryItemType = 5; state.ui.bombArmed = false; actions.drop();} }
            else return false;
            return true;
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
