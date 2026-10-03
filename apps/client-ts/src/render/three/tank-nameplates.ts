import * as THREE from "three";
import type { ClientState } from "../../app/state-types.js";
import { isMayorTank } from "./tank-role.js";
import { resolveWorldViewport } from "../../gameplay/world-viewport.js";
import "./tank-nameplates.css";
import { createTankHullMeter } from "./tank-hull-meter.js";
import { isTankLabelVisible, tankLabelSignature, tankLabelText, type Pilot } from "./pilot-presentation.js";

type Label = { root: HTMLDivElement; name: HTMLSpanElement; rank: HTMLSpanElement; signature: string; position: string; hull: ReturnType<typeof createTankHullMeter> };
const makeLabel = (container: HTMLElement): Label => {
    const root = document.createElement("div"), body = document.createElement("div"), name = document.createElement("span"), rank = document.createElement("span");
    root.className = "bc-tank-label"; body.className = "bc-tank-label-body";
    name.className = "bc-tank-label-name"; rank.className = "bc-tank-label-rank";
    body.append(name, rank); root.append(body); container.append(root);
    return { root, name, rank, signature: "", position: "", hull: createTankHullMeter(body) };
};

// Project the already-smoothed models, without querying layout or adding 3D text
// draws. Text changes only on identity/rank changes; transforms only on movement.
export const createTankNameplates = () => {
    const container = document.createElement("div"); container.className = "bc-tank-labels"; container.setAttribute("aria-hidden", "true"); document.body.append(container);
    const labels = new Map<string, Label>(), projected = new THREE.Vector3(); let previousWidth = -1;
    const hide = (label: Label | undefined): void => { if (label && !label.root.hidden) label.root.hidden = true; };
    const project = (model: THREE.Object3D, mayor: boolean, camera: THREE.Camera, width: number, height: number, worldWidth: number): boolean => {
        projected.copy(model.position); projected.y += mayor ? .84 : .67; projected.project(camera);
        projected.x = Math.round((projected.x + 1) * width / 2); projected.y = Math.round((1 - projected.y) * height / 2) - 7;
        return projected.z >= -1 && projected.z <= 1 && projected.x >= 0 && projected.x < worldWidth && projected.y > 0 && projected.y < height;
    };
    const updatePilot = (state: ClientState, id: string, pilot: Pilot, model: THREE.Object3D | undefined, camera: THREE.Camera, width: number, height: number, worldWidth: number, now: number): void => {
        const enemy = pilot.city !== state.local.city, mayor = isMayorTank(state, id);
        let label = labels.get(id);
        if (!model?.visible || !state.local.id || !isTankLabelVisible(pilot, state.local.city, now)) { hide(label); return; }
        if (!project(model, mayor, camera, width, height, worldWidth)) { hide(label); return; }
        if (!label) { label = makeLabel(container); labels.set(id, label); }
        if (label.root.hidden) label.root.hidden = false;
        const signature = tankLabelSignature(pilot, mayor, enemy);
        if (label.signature !== signature) {
            const text = tankLabelText(pilot, mayor); label.name.textContent = text.name; label.rank.textContent = text.rank;
            label.root.dataset.leader = String(pilot.isScoreLeader === true); label.root.dataset.team = enemy ? "enemy" : "friendly"; label.signature = signature;
        }
        label.hull.update(pilot, enemy);
        const position = `translate3d(${projected.x}px,${projected.y}px,0)`;
        if (label.position !== position) { label.root.style.transform = position; label.position = position; }
    };
    return {
        update(state: ClientState, camera: THREE.Camera, local: THREE.Object3D, remote: ReadonlyMap<string, THREE.Object3D> | undefined, width: number, height: number): void {
            const worldWidth = resolveWorldViewport(width, height).worldWidth, now = Date.now();
            if (previousWidth !== worldWidth) { container.style.width = `${worldWidth}px`; previousWidth = worldWidth; }
            for (const [id, label] of labels) if (id !== state.local.id && !state.remotePlayers.has(id)) { label.root.remove(); labels.delete(id); }
            if (state.local.id) updatePilot(state, state.local.id, state.local, local, camera, width, height, worldWidth, now);
            for (const [id, pilot] of state.remotePlayers) updatePilot(state, id, pilot, remote?.get(id), camera, width, height, worldWidth, now);
        },
        dispose(): void { container.remove(); labels.clear(); }
    };
};
