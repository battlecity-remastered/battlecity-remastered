import type { ClientState } from "./state-types.js";

// Keep first-use GPU work in the join transition. Movement starts only once
// hydration and preparation complete, so loading cannot accumulate inputs.
export const createWorldPreparation = (root: HTMLElement, prepare: (state: ClientState) => Promise<void>) => {
    const label = document.createElement("div");
    label.dataset.ui = "world-preparation";
    label.setAttribute("role", "status");
    label.textContent = "PREPARING BATTLEFIELD…";
    Object.assign(label.style, { position: "absolute", inset: "0", zIndex: "200", display: "grid", placeItems: "center", background: "#101a1ff2", color: "#a6d5cc", font: "14px monospace", letterSpacing: ".14em" });
    const show = (visible: boolean): void => {
        if (label.hidden === !visible) return;
        label.hidden = !visible; label.style.display = visible ? "grid" : "none";
    };
    show(false); root.append(label);
    let playerId: string | null = null, ready = false, running = false, disposed = false;
    return {
        ready(state: ClientState, hydrated: boolean): boolean {
            if (state.local.id !== playerId) { playerId = state.local.id; ready = false; }
            if (!playerId) { show(running); return !running; }
            if (ready) return true;
            show(!ready);
            if (!ready && !running && hydrated) {
                const preparingId = playerId;
                running = true;
                void prepare(state).catch(error => console.error("[game.prepare]", error)).finally(() => {
                    running = false;
                    if (!disposed && playerId === preparingId) { ready = true; show(false); }
                });
            }
            return ready;
        },
        dispose(): void { disposed = true; label.remove(); }
    };
};
