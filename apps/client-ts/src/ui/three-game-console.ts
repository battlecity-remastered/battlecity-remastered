const isBuildShortcut = (event: KeyboardEvent): boolean => event.key === "F4" || (event.key.toLowerCase() === "b" && event.ctrlKey);
import type { ClientState } from "../app/state.js";
import { isInteractiveKeyboardTarget } from "../input/interactive-target.js";
import type { EventSender } from "../network/events.js";
import { getCityDisplayName, resolveCitySpawn } from "../world/city-spawn.js";
import { applyBuildMenuHotkey, BUILD_TREE, canOpenBuildMenu, resolveBuildMenuEntries } from "./build-menu/BuildMenu.js";
import "./three-game.css";

const ignoresConsoleShortcut = (event: KeyboardEvent): boolean => event.repeat || isInteractiveKeyboardTarget(event) || event.altKey || event.metaKey;

type CityBuilding = ClientState["buildings"] extends Map<string, infer B> ? B : never;
const buildingActivity = (building: CityBuilding, cityStock: Map<number, number> | undefined, research: ClientState["research"] extends Map<number, infer R> ? R | undefined : never): string => building.type >= 100 && building.type <= 112 ? (building.population < 50 ? (building.attachedHouseId ? `STAFF ARRIVING · ${building.population}/50` : "NEEDS HOUSING") : `PRODUCTION ACTIVE · CARGO ×${cityStock?.get(building.type - 100) ?? 0}`) : building.type >= 400 ? (research?.completed.includes(building.type) ? "RESEARCH COMPLETE" : building.population < 50 ? "AWAITING WORKERS" : "RESEARCHING") : building.type === 300 ? "RESIDENTIAL SUPPORT" : "CITY COMMAND";

export const createGameConsole = (state: ClientState, send: EventSender, root: HTMLElement, sandbox = false) => {
    const hud = document.createElement("section"); hud.className = "bc-game-command"; hud.dataset.ui = "game-command";
    hud.innerHTML = `<div class="bc-game-title"><strong>BATTLECITY</strong><span data-field="city"></span></div><div class="bc-game-finance"></div><nav><button data-action="build">BUILD <kbd>F4</kbd></button><button data-action="city">CITY</button><button data-action="population" aria-pressed="false">POPULATION</button><button data-action="help">FIELD MANUAL</button><button data-action="leave">LEAVE CITY</button></nav><div class="bc-game-status" role="status"></div>`;
    const panel = document.createElement("section"); panel.className = "bc-construction"; panel.dataset.ui = "construction"; panel.hidden = true;
    panel.innerHTML = `<header><div><h2>Construction <kbd>F4</kbd></h2></div><button data-action="close" aria-label="Close construction">×</button></header><div class="bc-build-grid"></div><div class="bc-research-status"></div><button data-action="demolish"><kbd>0</kbd> Demolish</button>`;
    const help = document.createElement("section"); help.className = "bc-field-manual"; help.hidden = true; help.innerHTML = `<header><h2>Field manual</h2><button aria-label="Close field manual">×</button></header><p><b>Arrow keys</b> drive · <b>Space / click</b> fire · <b>Q / E</b> select cargo · <b>U</b> collect · <b>D / G</b> drop cargo · <b>Ctrl</b> flares · <b>M</b> tactical map · <b>Right-click / F4</b> construction · <b>F</b> fullscreen · <b>F3</b> diagnostics.</p><p>Mayors build their city. Housing supports two buildings; research unlocks factories and factories produce cargo. Collect lasers or rockets to arm your tank. D (or G) drops selected cargo on the original tile beneath your tank. B drops an armed bomb; V toggles bomb arming; O deploys an orb. Shift+X also drops cargo. Shift fires, Ctrl launches flares. C activates cloak; H uses a medkit. W/A/S remain movement aliases; D retains its classic drop action. The USE and ARM buttons perform those actions directly. A blocked drop stays blocked; it never moves to a neighbouring tile.</p><p>Carry an orb into an enemy command centre’s NO PARKING apron and deploy it to destroy that city. Defend your own apron with walls, turrets, mines and teammates. The radar points you home.</p><p>Chat supports team and global channels. Scores and city assignments are available in the lobby. L leaves the city and returns there.</p>`;
    const infrastructure = document.createElement("section"); infrastructure.className = "bc-city-infrastructure"; infrastructure.hidden = true; infrastructure.dataset.ui = "city-infrastructure"; infrastructure.innerHTML = '<header><h2>City systems</h2><button aria-label="Close city systems">×</button></header><p>Population supplies production. Each home supports two buildings.</p><div class="bc-city-buildings"></div>';
    root.append(hud, panel, help, infrastructure); let activeResearch: object | undefined, researchEndsAt = 0, citySignature = "", signature = "", statusUntil = 0, previousReason = "", lastRejectionCount = 0;
    const status = (message: string): void => { hud.querySelector(".bc-game-status")!.textContent = message; statusUntil = performance.now() + 6000; };
    const positionBuild = (): void => {
        if (panel.hidden) return;
        const bounds = root.getBoundingClientRect(), inventory = root.querySelector<HTMLElement>('[data-ui="three-inventory"]')?.getBoundingClientRect();
        const right = inventory ? inventory.left : bounds.right;
        panel.style.maxWidth = `${Math.max(0, Math.min(340, right - bounds.left - 16))}px`;
        const rect = panel.getBoundingClientRect();
        const x = Math.max(bounds.left + 8, Math.min(state.ui.buildMenuAnchorX + 6, right - rect.width - 8));
        const y = Math.max(bounds.top + 8, Math.min(state.ui.buildMenuAnchorY + 6, bounds.bottom - rect.height - 8));
        panel.style.left = `${x - bounds.left}px`; panel.style.top = `${y - bounds.top}px`;
    };
    const hideBuild = (): void => { panel.hidden = true; state.ui.showBuildMenu = false; };
    const toggleBuild = (anchor?: { x: number; y: number }): void => {
        if (!canOpenBuildMenu(state)) { status("Only your city’s mayor can build."); return; }
        if (state.ui.buildGhostMode || state.ui.buildDemolishMode) state.ui.showBuildMenu = false;
        applyBuildMenuHotkey(state, "F4", { anchorX: anchor?.x ?? state.pointer.x, anchorY: anchor?.y ?? state.pointer.y });
        panel.hidden = !state.ui.showBuildMenu; state.controls.shoot = false; positionBuild();
    };
    const demolish = (): void => { state.ui.buildDemolishMode = true; state.ui.buildGhostMode = false; hideBuild(); status("Click a city building to demolish · Escape cancels"); };
    const chooseBuild = (type: number): void => {
        if (type === 0) { const spawn = resolveCitySpawn(state.local.city); if (spawn && state.local.id) send("building.place.request", { ownerId: state.local.id, cityId: state.local.city, type: 0, tileX: spawn.tileX, tileY: spawn.tileY }); }
        else { state.ui.selectedBuildType = type; state.ui.buildGhostMode = true; state.ui.buildDemolishMode = false; status(`PLACE ${BUILD_TREE.find(entry => entry.type === type)?.label.toUpperCase()} · CLICK TO BUILD / ESC TO CANCEL`); }
        hideBuild(); state.controls.shoot = false;
    };
    const onKey = (event: KeyboardEvent): void => {
        if (ignoresConsoleShortcut(event)) return;
        let handled = true;
        if (isBuildShortcut(event)) toggleBuild();
        else if (event.key.toLowerCase() === "l" && !event.ctrlKey && state.local.id) { send("lobby.leave.request", {}); close(); }
        else if (event.key === "F1") { help.hidden = !help.hidden; state.controls.shoot = false; }
        else if (!panel.hidden && !event.ctrlKey && event.key === "0") demolish();
        else if (!panel.hidden && !event.ctrlKey) { const entry = resolveBuildMenuEntries(state).find(entry => entry.hotkey === event.key && entry.state === "available"); if (entry) chooseBuild(entry.type); else handled = false; }
        else handled = false;
        if (handled) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const outside = (event: PointerEvent): void => { if (event.button === 0 && !panel.hidden && !panel.contains(event.target as Node)) hideBuild(); };
    window.addEventListener("keydown", onKey, true); window.addEventListener("resize", positionBuild); document.addEventListener("pointerdown", outside);
    const close = (): void => { panel.hidden = true; state.ui.showBuildMenu = false; help.hidden = true; infrastructure.hidden = true; state.ui.buildGhostMode = state.ui.buildDemolishMode = false; state.ui.pendingBuildPlacement = null; };
    hud.querySelector('[data-action="build"]')!.addEventListener("click", () => toggleBuild());
    hud.querySelector('[data-action="population"]')!.addEventListener("click", () => { state.ui.selectedPopulationHouseId = null; state.ui.showPopulationLinks = !state.ui.showPopulationLinks; hud.querySelector('[data-action="population"]')!.setAttribute("aria-pressed", String(state.ui.showPopulationLinks)); status("Each home supports two buildings · links follow actual staffing assignments."); });
    infrastructure.querySelector("button")!.addEventListener("click", () => { infrastructure.hidden = true; });
    hud.querySelector('[data-action="city"]')!.addEventListener("click", () => { infrastructure.hidden = !infrastructure.hidden; state.controls.shoot = false; });
    hud.querySelector('[data-action="help"]')!.addEventListener("click", () => { help.hidden = !help.hidden; state.controls.shoot = false; });
    hud.querySelector('[data-action="leave"]')!.addEventListener("click", () => { if (state.local.id) send("lobby.leave.request", {}); close(); });
    panel.querySelector('[data-action="close"]')!.addEventListener("click", hideBuild); help.querySelector("button")!.addEventListener("click", () => { help.hidden = true; });
    panel.querySelector('[data-action="demolish"]')!.addEventListener("click", demolish);
    for (const element of [hud, panel, help, infrastructure]) for (const event of ["pointerdown", "click"]) element.addEventListener(event, e => e.stopPropagation());
    const buildingDescription = (building: CityBuilding): string => {
        const workers = building.type === 300 ? 100 : 50;
        return `${building.tileX},${building.tileY} · HULL ${building.health}/${building.maxHealth} · ${building.type === 300 ? "RESIDENTS" : "STAFF"} ${building.population}/${workers}${building.attachedHouseId ? " · HOME " + (state.buildings.get(building.attachedHouseId)?.tileX ?? "?") + "," + (state.buildings.get(building.attachedHouseId)?.tileY ?? "?") : ""}`;
    };
    const renderInfrastructure = (research: ClientState["research"] extends Map<number, infer R> ? R | undefined : never): void => {
        const cityBuildings = [...state.buildings.values()].filter(building => building.cityId === state.local.city), cityStock = state.factoryStock.get(state.local.city), nextCitySignature = JSON.stringify([cityBuildings, [...(cityStock ?? [])], research?.completed]);
        if (nextCitySignature !== citySignature) { citySignature = nextCitySignature; const list = infrastructure.querySelector(".bc-city-buildings")!; list.replaceChildren(); for (const building of cityBuildings) { const row = document.createElement("div"); row.className = "bc-city-building"; const name = BUILD_TREE.find(entry => entry.type === building.type)?.label ?? (building.type === 0 ? "Command centre" : `Building ${building.type}`); const title = document.createElement("strong"); title.textContent = name; const description = document.createElement("small"); description.textContent = buildingDescription(building); const detail = document.createElement("span"); detail.textContent = buildingActivity(building, cityStock, research); row.append(title, description, detail); list.append(row); } }
    };
    const renderConstruction = (): void => {
        const entries = resolveBuildMenuEntries(state); if (![...state.buildings.values()].some(building => building.cityId === state.local.city && building.type === 0)) entries.unshift({ hotkey: "", type: 0, label: "Rebuild command centre", menuIcon: 0, state: "available" }); const next = JSON.stringify(entries); if (next !== signature) {
            signature = next; const grid = panel.querySelector(".bc-build-grid")!; grid.replaceChildren(); grid.classList.toggle("bc-build-grid-wide", entries.length > 10); for (const entry of entries) {
                const button = document.createElement("button"); button.type = "button"; button.dataset.buildType = String(entry.type); button.title = entry.state === "pending" ? `${entry.label} · awaiting research` : entry.label;
                const icon = document.createElement("span"); icon.className = "bc-build-icon"; icon.style.backgroundPosition = `${-entry.menuIcon * 16}px 0`;
                const label = document.createElement("span"); label.textContent = entry.label.replace(" Research", " R&D").replace("Plasma Turret", "Plasma").replace("Flare Gun", "Flare");
                const shortcut = document.createElement("kbd"); shortcut.textContent = entry.hotkey === "0" ? "" : entry.hotkey;
                button.append(icon, label, shortcut); button.disabled = entry.state !== "available"; button.addEventListener("click", () => chooseBuild(entry.type)); grid.append(button);
            } positionBuild();
        }
    };
    const renderCommandStatus = (): void => {
        const reason = state.events.lastBuildDeniedReason ?? state.events.lastDemolishDeniedReason ?? state.events.lastRejectedReason; if (reason && (reason !== previousReason || state.events.rejectionCount !== lastRejectionCount)) { previousReason = reason; lastRejectionCount = state.events.rejectionCount; status(reason.replaceAll("_", " ").toUpperCase()); }
        if (performance.now() > statusUntil) hud.querySelector(".bc-game-status")!.textContent = sandbox ? (state.ui.buildGhostMode ? "CLICK TO PLACE · ESC CANCELS" : "MAYOR SANDBOX · RIGHT CLICK TO BUILD") : state.debug.socketConnected ? (state.ui.buildGhostMode ? "CLICK TO PLACE · ESC CANCELS" : "COMMAND LINK ONLINE") : "CONNECTION LOST · RECONNECTING";
    };
    return {
        toggleBuild, close, status, render(): void {
            hud.hidden = state.local.id === null;
            if (!canOpenBuildMenu(state)) hideBuild();
            panel.hidden = !state.ui.showBuildMenu;
            if (!state.local.id) { hideBuild(); state.ui.buildGhostMode = state.ui.buildDemolishMode = false; return; }
            hud.querySelector('[data-field="city"]')!.textContent = `${getCityDisplayName(state.local.city)} / ${state.identity.callsign}`;
            const finance = state.cityFinance.get(state.local.city), research = state.research.get(state.local.city);
            hud.querySelector(".bc-game-finance")!.textContent = `TREASURY $${Math.round(finance?.cash ?? 0).toLocaleString()} · INCOME $${Math.round(finance?.income ?? 0).toLocaleString()} · SCORE ${finance?.score ?? 0}`;
            if (research?.active !== activeResearch) { activeResearch = research?.active; researchEndsAt = Date.now() + (research?.active?.remainingMs ?? 0); }
            renderInfrastructure(research);
            renderConstruction();
            panel.querySelector(".bc-research-status")!.textContent = research?.active ? `RESEARCH: ${BUILD_TREE.find(entry => entry.type === research.active!.researchType)?.label ?? research.active.researchType} · ${Math.max(0, Math.ceil((researchEndsAt - Date.now()) / 1000))}s` : `${research?.completed.length ?? 0} research projects complete`;
            renderCommandStatus();
        }, dispose(): void { window.removeEventListener("keydown", onKey, true); window.removeEventListener("resize", positionBuild); document.removeEventListener("pointerdown", outside); hud.remove(); panel.remove(); help.remove(); infrastructure.remove(); }
    };
};
