import type { KnownTypedEventEnvelope } from "@battlecity/protocol";
import * as THREE from "three";
import type { ClientState } from "../../app/state.js";
import { isHiddenEnemyProximityHazard } from "../items/hazard-visibility.js";
import { isDefenseVisibleToLocalPlayer } from "../parity/defense-visibility.js";
import { createBombFuse } from "./bomb-fuse.js";
import { createDeployedDefense } from "./deployed-defense.js";
import type { IndustrialBuilding } from "./industrial-demo.js";
import { createSupportBuilding } from "./support-buildings.js";
import { createTankCloak } from "./tank-cloak.js";
import { isMayorTank, updateTankRole, updateTankTeam } from "./tank-role.js";
import { wrapSignedAngle } from "./turret-tracking.js";

// World models follow authoritative collections. Geometry/materials are shared
// with loaded templates; deleting an entity never disposes another one's assets.
export const createLiveWorld = (scene: THREE.Scene, tankTemplate: THREE.Object3D, items: ReadonlyMap<number, THREE.Object3D>, turret: THREE.Object3D, industrial: (building: IndustrialBuilding) => THREE.Object3D, animateItem: (type: number, model: THREE.Object3D) => void, release: (model: THREE.Object3D) => void, destroy?: (model: THREE.Object3D) => boolean) => {
    const players = new Map<string, THREE.Object3D>(), buildings = new Map<string, THREE.Object3D>(), hazards = new Map<string, THREE.Object3D>(), defenses = new Map<string, THREE.Object3D>(), outputs = new Map<string, THREE.Object3D>();
    const deployments = new Map<string, ReturnType<typeof createDeployedDefense>>();
    const destroyedIds = new Set<string>();
    const seenShots = new Set<string>();
    let hydrated = false;
    const fuses = new Map<string, ReturnType<typeof createBombFuse>>();
    const cloaks = new Map<string, ReturnType<typeof createTankCloak>>();
    const removeMissing = (models: Map<string, THREE.Object3D>, ids: { has: (id: string) => boolean }): void => { for (const [id, model] of models) if (!ids.has(id)) { deployments.get(id)?.dispose(); deployments.delete(id); cloaks.get(id)?.dispose(); cloaks.delete(id); fuses.get(id)?.dispose(); fuses.delete(id); release(model); const destroyed = destroyedIds.delete(id); if (!destroyed || !destroy?.(model)) { if (model.userData.commandCenter) model.visible = false; else model.removeFromParent(); } models.delete(id); } };
    const itemModel = (type: number): THREE.Object3D => { const model = items.get(type)?.clone(true) ?? new THREE.Group(); model.position.y = type === 5 ? 0.1 : 0.048; animateItem(type, model); scene.add(model); return model; };
    const createBuilding = (building: ClientState["buildings"] extends Map<string, infer B> ? B : never): THREE.Object3D => {
        if (building.type === 0) { const existing = scene.children.find(root => root.userData.renderTileX === building.tileX && root.userData.renderTileY === building.tileY); if (existing) { existing.visible = true; return existing; } return new THREE.Group(); }
        if (building.type >= 400 || (building.type >= 100 && building.type <= 112)) return industrial({ ...building, kind: building.type >= 400 ? "research" : building.type === 105 ? "orb-factory" : "factory" });
        const model = createSupportBuilding(building.type); model.position.set(building.tileX - 256 + 1.5, 0, building.tileY - 256 + (building.type === 200 ? 1 : 1.5)); scene.add(model); return model;
    };
    const updatePlayers = (state: ClientState, dt: number) => {
        removeMissing(players, state.remotePlayers);
        const alpha = state.remotePlayers.size ? 1 - Math.exp(-dt * 14) : 0;
        for (const [id, player] of state.remotePlayers) {
            let model = players.get(id); if (!model) { model = tankTemplate.clone(true); scene.add(model); players.set(id, model); cloaks.set(id, createTankCloak(model)); model.position.set((player.x + 24) / 48 - 256, 0, (player.y + 24) / 48 - 256); model.rotation.y = -player.direction * Math.PI / 16; }
            updateTankRole(model, isMayorTank(state, id)); updateTankTeam(model, player.city !== state.local.city);
            const cloaked = (player.cloakedUntil ?? 0) > Date.now(); model.visible = !cloaked || player.city === state.local.city; cloaks.get(id)?.update(cloaked);
            model.position.x += ((player.x + 24) / 48 - 256 - model.position.x) * alpha; model.position.z += ((player.y + 24) / 48 - 256 - model.position.z) * alpha; const target = -player.direction * Math.PI / 16; model.rotation.y += wrapSignedAngle(target - model.rotation.y) * alpha;
        }
    };
    const updateHazards = (state: ClientState) => {
        removeMissing(hazards, state.hazards);
        for (const [id, hazard] of state.hazards) { let model = hazards.get(id); if (!model) { model = itemModel(hazard.type); hazards.set(id, model); if (hazard.type === 3) fuses.set(id, createBombFuse(model)); } fuses.get(id)?.update(Date.now(), hazard.armed && hazard.active !== false ? hazard.fuseEndsAt : undefined); model.visible = !isHiddenEnemyProximityHazard(state.local.city, hazard); model.position.set((hazard.x + 24) / 48 - 256, hazard.type === 5 ? 0.1 : 0.048, (hazard.y + 24) / 48 - 256); }
    };
    const updateDefenses = (state: ClientState, dt: number) => {
        removeMissing(defenses, state.defenses);
        const firing = new Set<string>();
        for (const [id, bullet] of state.bullets) if (!seenShots.has(id)) { seenShots.add(id); firing.add(bullet.ownerId); }
        for (const id of seenShots) if (!state.bullets.has(id)) seenShots.delete(id);
        for (const [id, defense] of state.defenses) { let model = defenses.get(id); if (!model) { const deployment = createDeployedDefense(defense.type, turret, items.get(defense.type), hydrated); model = deployment.root; scene.add(model); defenses.set(id, model); deployments.set(id, deployment); } model.position.set(defense.tileX - 256 + 0.5, 0, defense.tileY - 256 + 0.5); const visible = isDefenseVisibleToLocalPlayer(state, defense); if (visible && !model.visible && defense.type === 10) deployments.get(id)!.reveal(); model.visible = visible; if (visible) deployments.get(id)!.update(dt, defense.orientation, firing.has(id)); }
        hydrated = true;
    };
    return {
        observe(event: KnownTypedEventEnvelope): void {
            if (event.type === "building.demolished" || (event.type === "defense.remove" && event.payload.reason === "destroyed")) { destroyedIds.add(event.payload.id); if (destroyedIds.size > 256) destroyedIds.delete(destroyedIds.values().next().value!); }
        }, update(state: ClientState, dt: number): void {
            updatePlayers(state, dt);
            removeMissing(buildings, state.buildings);
            for (const [id, building] of state.buildings) if (!buildings.has(id)) { const model = createBuilding(building); model.userData.renderTileX = building.tileX; model.userData.renderTileY = building.tileY; buildings.set(id, model); }
            updateHazards(state);
            updateDefenses(state, dt);
            const outputIds = new Set<string>();
            for (const [id, building] of state.buildings) { if (building.type < 100 || building.type > 112) continue; const type = building.type - 100, stock = state.factoryStock.get(building.cityId)?.get(type) ?? 0; if (stock <= 0) continue; outputIds.add(id); let model = outputs.get(id); if (!model) { model = itemModel(type); outputs.set(id, model); } model.position.set(building.tileX - 256 + 80 / 48, type === 5 ? 0.1 : 0.048, building.tileY - 256 + 126 / 48); }
            removeMissing(outputs, outputIds);
        }
    };
};
