import { tankHullRatio } from "./tank-hull-meter.js";
import * as THREE from "three";
import type { ClientState } from "../../app/state.js";
import { createThreeInventoryControls } from "../../input/three-inventory-controls.js";
import { getCityDisplayName as nextCityName } from "../../world/city-spawn.js";
import type { DemoWeapon } from "./demo-combat.js";
import { clickInventoryItem, INVENTORY_ITEMS, INVENTORY_ORDER, seedDemoInventory, selectedWeapon, selectInventoryItem } from "./inventory-model.js";
import "./inventory-panel.css";
import { prepareScreenScene } from "./prepare-render-passes.js";
import { createInventoryRadar } from "./inventory-radar.js";
import type { RadarMap } from "./radar-model.js";

// One renderer supplies the battlefield, static cargo icons and the live specimen.
// The live view is a small scissored viewport, avoiding GPU readback each frame.
const INVENTORY_MARKUP = `
        <header class="bc-command"><span class="bc-sigil">B<span>C</span></span><div><small>COMMAND LINK / 01</small><strong>BALKH</strong></div><i title="Offline demo connected"></i></header>
        <section class="bc-telemetry"><div><span>HULL INTEGRITY</span><b data-field="health">100%</b></div><div class="bc-health"><span></span></div><div class="bc-telemetry-bottom"><span>PRIVATE · RAIDER</span><span>OFFLINE DEMO</span></div></section>
        <div class="bc-inventory-scroll">
            <div class="bc-section-title"><span>FIELD INVENTORY</span><small data-field="systems">13 SYSTEMS</small></div>
            <section class="bc-specimen"><div class="bc-specimen-viewport" aria-label="Animated selected item preview"><span class="bc-specimen-id"></span><span class="bc-specimen-caption">LIVE SPECIMEN</span><div class="bc-reticle"></div></div></section>
            <section class="bc-specimen-info"><div><small data-field="category"></small><b data-field="stock"></b></div><h2 data-field="name"></h2><p data-field="description"></p><div class="bc-cargo-actions"><button class="bc-cargo-action" type="button">DROP CARGO <kbd>D</kbd></button><button class="bc-arm-action" type="button" hidden>ARM</button></div></section>
            <div class="bc-section-title bc-manifest-title"><span>CARGO MANIFEST</span><small>Q / E SELECT</small></div>
            <div class="bc-item-grid" role="group" aria-label="Inventory items"></div>
            <section class="bc-fire-control"><div><span>FIRE CONTROL</span><b data-field="weapon">CANNON</b></div><button type="button" class="bc-cannon">Cannon</button><span class="bc-fire-hint">SPACE / HOLD CLICK</span></section>
        </div>
        <footer class="bc-inventory-footer"><div class="bc-cargo-status" role="status" aria-live="polite">ALL SYSTEMS READY</div><div><button type="button" class="bc-collect"><kbd>U</kbd> COLLECT</button><span><kbd>D</kbd> DROP</span><button type="button" class="bc-audio" aria-label="Mute sound" aria-pressed="false">SOUND ON</button></div></footer>`;

export const createInventoryPanel = (renderer: THREE.WebGLRenderer, environment: THREE.Texture, templates: ReadonlyMap<number, THREE.Object3D>, drop: (type: number, state: ClientState) => boolean, animate: (type: number, model: THREE.Object3D) => void, navigation: RadarMap, online = false, arm?: (type: number) => boolean) => {
    const root = document.createElement("aside");
    root.dataset.ui = "three-inventory";
    root.className = "bc-inventory";
    root.setAttribute("aria-label", "BattleCity inventory");
    root.innerHTML = INVENTORY_MARKUP;
    document.getElementById("app")!.append(root);
    const radar = createInventoryRadar(root, navigation);
    const grid = root.querySelector<HTMLElement>(".bc-item-grid")!;
    const viewport = root.querySelector<HTMLElement>(".bc-specimen-viewport")!;
    const fields = new Map(Array.from(root.querySelectorAll<HTMLElement>("[data-field]")).map(node => [node.dataset.field!, node]));
    const action = root.querySelector<HTMLButtonElement>(".bc-cargo-action")!;
    const armButton = root.querySelector<HTMLButtonElement>(".bc-arm-action")!;
    armButton.addEventListener("click", () => {
        const type = state?.ui.selectedInventoryItemType;
        if (type === 3 && state && (state.inventory.get(3) ?? 0) > 0) { state.ui.bombArmed = !state.ui.bombArmed; notify(state.ui.bombArmed ? "BOMB ARMED · DROP TO START FUSE" : "BOMB DISARMED"); refresh(); }
        else if (type === 2 && state && state.local.health >= state.local.maxHealth) { notify("HULL INTACT · MEDKIT RETAINED"); }
        else if (type === 0 || type === 2) { notify(arm?.(type) ? "ITEM USE SENT" : "ITEM UNAVAILABLE"); refresh(); }
    });
    const audioButton = root.querySelector<HTMLButtonElement>(".bc-audio")!;
    const status = root.querySelector<HTMLElement>(".bc-cargo-status")!;
    const buttons = new Map<number, HTMLButtonElement>();
    let state: ClientState | undefined, weapon: DemoWeapon = online ? "laser" : "cannon", selection = -1, statusUntil = 0, lastSnapshot = "";


    const createSpecimenScene = () => {
        const specimen = new THREE.Scene();
        specimen.background = new THREE.Color(0x071115);
        specimen.environment = environment;
        specimen.environmentIntensity = 1.0;
        specimen.add(new THREE.HemisphereLight(0xbcf1ef, 0x1b1527, 1.8));
        const key = new THREE.DirectionalLight(0xffe4c6, 4); key.position.set(-2, 3, 4); specimen.add(key);
        const rim = new THREE.DirectionalLight(0x62caff, 3); rim.position.set(2, 1, -2); specimen.add(rim);
        const turntable = new THREE.Group(); specimen.add(turntable);
        const models = new Map<number, THREE.Object3D>();
        const camera = new THREE.OrthographicCamera(-0.56, 0.56, 0.56, -0.56, 0.1, 12);
        camera.position.set(0, 1.35, 2.8); camera.lookAt(0, 0, 0);
        return { specimen, turntable, models, camera };
    };
    const { specimen, turntable, models, camera } = createSpecimenScene();
    const captureIcons = () => {
        const iconTarget = new THREE.WebGLRenderTarget(112, 112);
        iconTarget.texture.colorSpace = THREE.SRGBColorSpace;
        const pixels = new Uint8Array(112 * 112 * 4), canvas = document.createElement("canvas"); canvas.width = canvas.height = 112;
        const context = canvas.getContext("2d")!;
        const oldTarget = renderer.getRenderTarget(), oldViewport = renderer.getViewport(new THREE.Vector4()), oldScissor = renderer.getScissor(new THREE.Vector4()), oldTest = renderer.getScissorTest();
        const oldAlpha = renderer.getClearAlpha(), oldClear = renderer.getClearColor(new THREE.Color());
        const icons = new Map<number, string>();
        // Model bounds determine preview framing only; world geometry and scale stay fixed.
        for (const item of INVENTORY_ITEMS) {
            const template = templates.get(item.type); if (!template) continue;
            const model = template.clone(true), bounds = new THREE.Box3().setFromObject(model);
            model.position.sub(bounds.getCenter(new THREE.Vector3()));
            const size = bounds.getSize(new THREE.Vector3());
            animate(item.type, model);
            const holder = new THREE.Group(); holder.add(model); holder.scale.setScalar(0.78 / Math.max(size.x, size.y, size.z, 0.01));
            holder.visible = true; turntable.add(holder); models.set(item.type, holder);
            model.traverse(part => { if (part instanceof THREE.Mesh) { part.castShadow = part.receiveShadow = false; } });
            turntable.rotation.y = -0.48;
            specimen.background = null;
            renderer.setRenderTarget(iconTarget); renderer.setViewport(0, 0, 112, 112); renderer.setScissorTest(false); renderer.setClearColor(0x071115, 0);
            renderer.clear(); renderer.render(specimen, camera); renderer.readRenderTargetPixels(iconTarget, 0, 0, 112, 112, pixels);
            // Flip the GPU's bottom-up rows for a normal DOM image.
            const output = context.createImageData(112, 112);
            for (let y = 0; y < 112; y++) output.data.set(pixels.subarray((111 - y) * 448, (112 - y) * 448), y * 448);
            context.putImageData(output, 0, 0); icons.set(item.type, canvas.toDataURL()); holder.visible = false;
        }
        iconTarget.dispose(); specimen.background = new THREE.Color(0x071115);
        renderer.setRenderTarget(oldTarget); renderer.setViewport(oldViewport); renderer.setScissor(oldScissor); renderer.setScissorTest(oldTest); renderer.setClearColor(oldClear, oldAlpha);
        return icons;
    };
    const icons = captureIcons();
    for (const type of INVENTORY_ORDER) {
        const item = INVENTORY_ITEMS[type]!;
        const button = document.createElement("button"); button.type = "button"; button.className = "bc-item";
        button.dataset.itemType = String(type); button.style.setProperty("--item-accent", item.accent);
        button.setAttribute("aria-label", item.name); button.setAttribute("aria-pressed", "false");
        const image = document.createElement("img"); image.src = icons.get(type) ?? ""; image.alt = ""; image.draggable = false;
        const label = document.createElement("span"); label.className = "bc-item-name"; label.textContent = item.name;
        const count = document.createElement("b"); count.className = "bc-item-count";
        button.append(image, label, count); grid.append(button); buttons.set(type, button);
        button.addEventListener("click", () => { if (state && clickInventoryItem(state, type)) { const equipped = selectedWeapon(type); if (equipped) weapon = equipped; if (type === 3) notify(state.ui.bombArmed ? "BOMB ARMED · DROP TO START FUSE" : "BOMB DISARMED · CLICK AGAIN / V TO ARM"); refresh(); } });
    }
    const notify = (text: string): void => { status.textContent = text; root.dataset.cargoAction = text; statusUntil = performance.now() + 5000; };
    const dropSelected = (): void => {
        const type = state?.ui.selectedInventoryItemType;
        if (!state || type === null || type === undefined) return;
        notify(drop(type, state) ? `${INVENTORY_ITEMS[type]!.name.toUpperCase()} · ${online ? "COMMAND SENT" : "CARGO RELEASED"}` : "TILE UNDER TANK IS BLOCKED"); refresh();
    };
    action.addEventListener("click", dropSelected);
    if (online) root.querySelector(".bc-cannon")!.textContent = "Laser";
    root.querySelector(".bc-cannon")!.addEventListener("click", () => { weapon = online ? "laser" : "cannon"; refresh(); });
    audioButton.addEventListener("click", () => { if (state) { state.ui.audioEnabled = !state.ui.audioEnabled; refresh(); } });

    const containPanelGestures = (): void => {
        // Keep inventory gestures inside the panel.
        for (const type of ["pointerdown", "mousedown", "click", "wheel"]) root.addEventListener(type, event => event.stopPropagation());
        root.addEventListener("click", event => { if (event.detail > 0) (event.target as HTMLElement).closest<HTMLButtonElement>("button")?.blur(); });
        root.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") event.stopPropagation();
        });
    };
    containPanelGestures();
    const controls = createThreeInventoryControls(() => state, {
        cycle(direction) {
            const entries = INVENTORY_ORDER.filter(type => (state!.inventory.get(type) ?? 0) > 0);
            const index = entries.findIndex(type => type === state!.ui.selectedInventoryItemType);
            const next = entries[(index + direction + entries.length) % entries.length];
            if (next !== undefined) { selectInventoryItem(state!, next); const equipped = selectedWeapon(next); if (equipped) weapon = equipped; refresh(); }
        },
        drop: dropSelected,
        use(type) { notify(arm?.(type) ? "ITEM USE SENT" : "ITEM UNAVAILABLE"); refresh(); },
        changed() { notify(state!.ui.bombArmed ? "BOMB ARMED · V TO DISARM" : "BOMB DISARMED · V TO ARM"); refresh(); }
    });
    root.querySelector(".bc-collect")!.addEventListener("click", () => controls.requestCollect());
    const onKey = (event: KeyboardEvent): void => {
        if (!controls.keyDown(event)) return;
        event.preventDefault(); event.stopImmediatePropagation();
    };
    const onKeyUp = (event: KeyboardEvent): void => controls.keyUp(event);
    const onBlur = (): void => controls.reset();
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    const selectSpecimen = (selected: number): void => {
        if (selection !== selected) { const previous = models.get(selection); if (previous) previous.visible = false; const model = models.get(selected); if (model) model.visible = true; selection = selected; }
    };
    const refreshActionButtons = (selected: number): void => {
        if (!state) return;
        armButton.hidden = selected !== 3 && selected !== 0 && selected !== 2; armButton.disabled = action.disabled; armButton.textContent = selected === 3 ? (state.ui.bombArmed ? "DISARM" : "ARM") : "USE"; armButton.setAttribute("aria-pressed", String(selected === 3 && state.ui.bombArmed));
        audioButton.textContent = state.ui.audioEnabled ? "SOUND ON" : "SOUND OFF";
        audioButton.setAttribute("aria-pressed", String(!state.ui.audioEnabled)); audioButton.setAttribute("aria-label", state.ui.audioEnabled ? "Mute sound" : "Enable sound");
    };
    const refresh = (): void => {
        if (!state) return;
        const selected = state.ui.selectedInventoryItemType ?? 5, item = INVENTORY_ITEMS[selected] ?? INVENTORY_ITEMS[5]!;
        const snapshot = JSON.stringify([selected, [...state.inventory], weapon, state.ui.bombArmed, state.local.health, state.local.maxHealth, state.ui.audioEnabled, state.local.city, state.debug.socketConnected]);
        if (snapshot === lastSnapshot) return; lastSnapshot = snapshot;
        if (online) { root.querySelector(".bc-telemetry-bottom")!.textContent = `CITY ${state.local.city + 1} · ${state.debug.socketConnected ? "ONLINE" : "OFFLINE"}`; root.querySelector(".bc-command small")!.textContent = `COMMAND LINK / ${String(state.local.city + 1).padStart(2, "0")}`; root.querySelector(".bc-command strong")!.textContent = nextCityName(state.local.city); action.innerHTML = "DROP ITEM" + " <kbd>D</kbd>"; }

        root.style.setProperty("--selected-accent", item.accent);
        root.dataset.selected = String(selected); root.dataset.weapon = weapon; root.dataset.bombArmed = String(state.ui.bombArmed);
        selectSpecimen(selected);
        fields.get("name")!.textContent = item.name; fields.get("category")!.textContent = item.category;
        fields.get("description")!.textContent = selected === 3 ? `${item.description} ${state.ui.bombArmed ? "ARMED" : "DISARMED"} · V toggles.` : item.description;
        fields.get("stock")!.textContent = `×${state.inventory.get(selected) ?? 0}`;
        fields.get("weapon")!.textContent = weapon.toUpperCase();
        fields.get("health")!.textContent = `${Math.round((tankHullRatio(state.local) ?? 0) * 100)}%`;
        root.querySelector<HTMLElement>(".bc-health span")!.style.width = `${(tankHullRatio(state.local) ?? 0) * 100}%`;
        root.querySelector(".bc-specimen-id")!.textContent = `BC / ${String(item.type).padStart(2, "0")}`;
        fields.get("systems")!.textContent = `${[...state.inventory.values()].filter(count => count > 0).length} SYSTEMS`;
        action.disabled = (state.inventory.get(selected) ?? 0) <= 0;
        refreshActionButtons(selected);
        for (const [type, button] of buttons) { const count = state.inventory.get(type) ?? 0; button.querySelector("b")!.textContent = `${count}`; button.classList.toggle("is-selected", type === selected); button.disabled = count <= 0; button.setAttribute("aria-pressed", String(type === selected)); button.setAttribute("aria-label", `${INVENTORY_ITEMS[type]!.name}, ${count} available`); }
    };
    return {
        prepare: (): Promise<void> => prepareScreenScene(renderer, specimen, camera),
        update: (next: ClientState): DemoWeapon => { if (!state && !online) { seedDemoInventory(next); } state = next; radar.update(next); refresh(); if (performance.now() > statusUntil) { const message = online ? (next.debug.socketConnected ? "COMMAND LINK ONLINE" : "RECONNECTING…") : "OFFLINE CARGO · LIVE PREVIEW"; if (status.textContent !== message) status.textContent = message; } return weapon; },
        collectRequested: (): boolean => controls.collectRequested(performance.now()),
        notify,
        render: (seconds: number): void => {
            const rect = viewport.getBoundingClientRect(); if (rect.bottom <= 0 || rect.top >= window.innerHeight) return;
            const clipping = root.querySelector(".bc-inventory-scroll")!.getBoundingClientRect();
            const top = Math.max(rect.top, clipping.top), bottom = Math.min(rect.bottom, clipping.bottom); if (bottom <= top) return;
            turntable.rotation.y = -0.48 + seconds * 0.36; turntable.position.y = Math.sin(seconds * 1.4) * 0.025;
            const aspect = rect.width / rect.height; camera.left = -0.56 * aspect; camera.right = 0.56 * aspect; camera.updateProjectionMatrix();
            const target = renderer.getRenderTarget(), vp = renderer.getViewport(new THREE.Vector4()), scissor = renderer.getScissor(new THREE.Vector4()), test = renderer.getScissorTest();
            renderer.setRenderTarget(null); renderer.setViewport(rect.left, window.innerHeight - rect.bottom, rect.width, rect.height);
            renderer.setScissor(rect.left, window.innerHeight - bottom, rect.width, bottom - top); renderer.setScissorTest(true);
            renderer.clearDepth(); renderer.render(specimen, camera);
            renderer.setRenderTarget(target); renderer.setViewport(vp); renderer.setScissor(scissor); renderer.setScissorTest(test);
        },
        dispose: (): void => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("keyup", onKeyUp, true); window.removeEventListener("blur", onBlur); radar.dispose(); root.remove(); }
    };
};
