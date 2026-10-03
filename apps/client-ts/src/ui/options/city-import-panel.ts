import type { ClientState } from "../../app/state.js";
import type { EventSender } from "../../network/events.js";
import { canOpenBuildMenu, clearBuildInteractionModes } from "../build-menu/BuildMenu.js";
import { getCityDisplayName } from "../../world/city-spawn.js";
import "./city-import-panel.css";

export const createCityImportPanel = (state: ClientState, send: EventSender, root: HTMLElement, sandbox: boolean) => {
    const panel = document.createElement("section"); panel.className = "bc-city-import"; panel.dataset.ui = "city-import"; panel.hidden = true;
    panel.setAttribute("role", "dialog"); panel.setAttribute("aria-labelledby", "bc-city-import-title");
    panel.innerHTML = `<header><div><small>COMMAND SETTINGS</small><h2 id="bc-city-import-title">City layout</h2></div><button type="button" data-action="close" aria-label="Close settings">×</button></header><p data-field="city"></p><p>Paste your city builder JSON export. This replaces your city’s buildings, defenses and hazards.</p><label for="bc-city-import-json">BUILDER EXPORT</label><textarea id="bc-city-import-json" aria-label="City layout JSON" spellcheck="false" maxlength="196608" placeholder='{ "layout": [...], "defenses": [...] }'></textarea><footer><span data-field="access"></span><button type="button" data-action="import">REPLACE CITY</button></footer><div class="bc-import-status" role="status" aria-live="polite"></div>`;
    root.append(panel);
    const editor = panel.querySelector("textarea")!, button = panel.querySelector<HTMLButtonElement>('[data-action="import"]')!;
    const message = panel.querySelector<HTMLElement>(".bc-import-status")!;
    let deadline = 0, previousFocus: HTMLElement | null = null;
    const close = (): void => { state.ui.showOptionsModal = false; panel.hidden = true; previousFocus?.focus({ preventScroll: true }); };
    const toggle = (): void => {
        if (state.ui.showOptionsModal) { close(); return; }
        previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        clearBuildInteractionModes(state); state.ui.showBuildMenu = false;
        for (const key of Object.keys(state.controls) as Array<keyof ClientState["controls"]>) state.controls[key] = false;
        state.ui.showOptionsModal = true; panel.hidden = false; editor.focus({ preventScroll: true });
    };
    const submit = (): void => {
        if (state.ui.optionsCityImportApplying || sandbox || !state.debug.socketConnected || !canOpenBuildMenu(state)) return;
        const json = editor.value.trim();
        try { JSON.parse(json); } catch { state.ui.optionsCityImportStatus = "Paste a complete, valid JSON builder export."; return; }
        state.ui.optionsCityImportApplying = true; state.ui.optionsCityImportStatus = "Validating and importing your city…";
        deadline = performance.now() + 10000;
        send("city.layout.import.request", { json });
    };
    panel.querySelector('[data-action="close"]')!.addEventListener("click", close);
    button.addEventListener("click", submit);
    for (const event of ["pointerdown", "click", "contextmenu"]) panel.addEventListener(event, e => e.stopPropagation());
    panel.addEventListener("keydown", event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } });
    return {
        toggle, close,
        render(): void {
            panel.hidden = !state.ui.showOptionsModal || state.local.id === null;
            if (panel.hidden) return;
            if (state.ui.optionsCityImportApplying && (!state.debug.socketConnected || performance.now() > deadline)) {
                state.ui.optionsCityImportApplying = false;
                state.ui.optionsCityImportStatus = "No response yet. Reconnect and check your city before retrying.";
            }
            const allowed = canOpenBuildMenu(state) && state.debug.socketConnected && !sandbox;
            panel.querySelector('[data-field="city"]')!.textContent = `${getCityDisplayName(state.local.city)} · YOUR CURRENT CITY`;
            panel.querySelector('[data-field="access"]')!.textContent = sandbox ? "AVAILABLE IN A LIVE MATCH" : allowed ? "MAYOR ACCESS" : "ONLY THE CITY MAYOR CAN IMPORT";
            button.disabled = !allowed || state.ui.optionsCityImportApplying;
            button.textContent = state.ui.optionsCityImportApplying ? "IMPORTING…" : "REPLACE CITY";
            panel.setAttribute("aria-busy", String(state.ui.optionsCityImportApplying));
            message.textContent = state.ui.optionsCityImportStatus ?? "Buildings are checked before your current layout is replaced.";
        },
        dispose(): void { panel.remove(); }
    };
};
