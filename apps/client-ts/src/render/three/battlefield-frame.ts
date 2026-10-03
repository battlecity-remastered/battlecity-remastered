import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { detonateDemoBombs } from "../../app/demo-bombs.js";
import { type ClientState } from "../../app/state.js";
import type { createThreeGameActions } from "../../app/three-game-actions.js";
import { resolvePlayerDominantTile } from "../../gameplay/items/drop-placement.js";
import { TILE_SIZE } from "../../gameplay/world-viewport.js";
import { isGhostTileBlocked } from "../../ui/build-menu/GhostPlacement.js";
import { createBombFuse } from "./bomb-fuse.js";
import { createBuildingBatches } from "./building-batches.js";
import { thawBuildingTransforms } from "./building-transforms.js";
import { createOrbGroundShake } from "./orb-ground-shake.js";
import { createBattlefieldCamera, positionBattlefieldCamera } from "./camera.js";
import { createCannonEffects } from "./cannon-effects.js";
import { createDefenseTurrets } from "./defense-turrets.js";
import { createDeployedDefense } from "./deployed-defense.js";
import { createBuildingEffects, createIndustrialEffects, createLavaEffects } from "./effects.js";
import { createHeatOutputPass } from "./heat-pass.js";
import { FACTORY_PRODUCTS } from "./industrial-demo.js";
import { transferInventoryItem } from "./inventory-model.js";
import { createInventoryPanel } from "./inventory-panel.js";
import { createLiveWorld } from "./live-world.js";
import { createNetworkCombat } from "./network-combat.js";
import { createOrbVictoryEffects } from "./orb-victory-effects.js";
import { createPopulationDisplay } from "./population-display.js";
import { createProjectileCollider } from "./projectile-collider.js";
import { createResearchDisplays } from "./research-display.js";
import { createTankCloak } from "./tank-cloak.js";
import { createTankNameplates } from "./tank-nameplates.js";
import { resolveTankDropTarget } from "./tank-drop-target.js";
import { isMayorTank, updateTankRole, updateTankTeam } from "./tank-role.js";
import { createTerrain } from "./terrain.js";
import { createLightVariantWarmup } from "./light-variant-warmup.js";

type FrameContext = {
    tankNameplates: ReturnType<typeof createTankNameplates>;
    demoMode: boolean;
    scene: THREE.Scene;
    renderer: THREE.WebGLRenderer;
    setDiagnostic: (name: string, value: string) => void;
    heatPass: ReturnType<typeof createHeatOutputPass>;
    terrain: ReturnType<typeof createTerrain>;
    deployedPreview: ReturnType<typeof createDeployedDefense>[];
    cargo: Array<{ type: number; model: THREE.Object3D; hazardId?: string; factoryTileX?: number; factoryTileY?: number }>;
    demoFuses: Map<string, ReturnType<typeof createBombFuse>>;
    machinery: Map<string, ReturnType<typeof createBuildingEffects>>;
    industrialEffects: ReturnType<typeof createIndustrialEffects>;
    researchDisplays: ReturnType<typeof createResearchDisplays>;
    projectileCollider: ReturnType<typeof createProjectileCollider>;
    cannon: ReturnType<typeof createCannonEffects>;
    turrets: ReturnType<typeof createDefenseTurrets> | null;
    dropReticle: THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
    ghost: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>;
    liveWorld: ReturnType<typeof createLiveWorld> | null;
    orbVictory: ReturnType<typeof createOrbVictoryEffects>;
    populationDisplay: ReturnType<typeof createPopulationDisplay>;
    preview: { audioEnabled: boolean; collapse: number };
    collapsing: Array<{ root: THREE.Object3D; scale: THREE.Vector3; y: number; delay: number }>;
    tank: THREE.Object3D;
    camera: ReturnType<typeof createBattlefieldCamera>;
    displayFrustum: THREE.Frustum;
    displayProjection: THREE.Matrix4;
    lavaEffects: ReturnType<typeof createLavaEffects>;
    buildingEffects: ReturnType<typeof createBuildingEffects>;
    tankCloak: ReturnType<typeof createTankCloak>;
    inventory: ReturnType<typeof createInventoryPanel>;
    actions: ReturnType<typeof createThreeGameActions> | undefined;
    storedCargo: Map<number, THREE.Object3D[]>;
    networkCombat: ReturnType<typeof createNetworkCombat>;
    sun: THREE.DirectionalLight;
    buildingBatches: ReturnType<typeof createBuildingBatches>;
    composer: EffectComposer;
    lightWarmup: ReturnType<typeof createLightVariantWarmup>;
};

export const createBattlefieldFrame = (context: FrameContext) => {
    const { demoMode, scene, renderer, setDiagnostic, heatPass, terrain, deployedPreview, cargo, demoFuses, machinery, industrialEffects, researchDisplays, projectileCollider, cannon, turrets, dropReticle, ghost, liveWorld, orbVictory, populationDisplay, preview, collapsing, tank, camera, displayFrustum, displayProjection, lavaEffects, buildingEffects, tankCloak, inventory, actions, storedCargo, networkCombat, sun, buildingBatches, composer } = context;
    let lastSeconds = performance.now() / 1000;
    const stageTimes: Record<string, number> = {};
    let lastProfileAt = -Infinity;
    const releaseDestroyedModel = (model: THREE.Object3D, defense = false): void => {
        thawBuildingTransforms(model);
        projectileCollider.unregister(model);
        if (defense) {
            if (!cannon.destroy(model)) model.visible = false;
            turrets?.unregister(model);
            for (const effects of machinery.values()) effects.unregister(model);
        } else {
            buildingBatches.unregister(model);
            for (const effects of machinery.values()) effects.unregister(model);
            industrialEffects.unregister(model);
            researchDisplays.unregister(model);
            if (!cannon.destroy(model)) model.visible = false;
        }
    };
    const removeDestroyedCargo = (state: ClientState, destroyed: ReturnType<typeof detonateDemoBombs>) => {
        for (let i = cargo.length - 1; i >= 0; i--) {
            const item = cargo[i]!;
            const removed = item.hazardId ? !state.hazards.has(item.hazardId) : destroyed.buildings.some(building => building.tileX === item.factoryTileX && building.tileY === item.factoryTileY);
            if (removed) { item.model.visible = false; item.model.removeFromParent(); if (item.hazardId) { demoFuses.get(item.hazardId)?.dispose(); demoFuses.delete(item.hazardId); } machinery.get(`${FACTORY_PRODUCTS[item.type]}-item`)?.unregister(item.model); industrialEffects.unregister(item.model); cargo.splice(i, 1); }
        }
    };
    const updateDemoDestruction = (state: ClientState) => {
        if (demoMode) {
            const destroyed = detonateDemoBombs(state, Date.now());
            for (const point of destroyed.blasts) cannon.blast({ x: point.x / 48 - 256, y: .3, z: point.y / 48 - 256 });
            for (const building of destroyed.buildings) for (const model of scene.children) if (model.userData.renderTileX === building.tileX && model.userData.renderTileY === building.tileY) { releaseDestroyedModel(model); }
            for (const id of destroyed.defenses) for (const model of scene.children) if (model.userData.previewDefenseId === id) { releaseDestroyedModel(model, true); }
            removeDestroyedCargo(state, destroyed);
            for (const [id, fuse] of demoFuses) fuse.update(Date.now(), state.hazards.get(id)?.fuseEndsAt);
        }
    };
    const updatePlacement = (state: ClientState) => {
        const targetTile = resolvePlayerDominantTile(state), dropTarget = resolveTankDropTarget(state);
        dropReticle.visible = Boolean(state.local.id && state.ui.selectedInventoryItemType !== null && (state.inventory.get(state.ui.selectedInventoryItemType) ?? 0) > 0 && !state.ui.buildGhostMode && !state.ui.buildDemolishMode);
        dropReticle.position.set(targetTile.tileX - 256 + .5, .035, targetTile.tileY - 256 + .5); dropReticle.material.color.setHex(dropTarget ? 0x83dfbc : 0xf18465);
        setDiagnostic("dropTile", JSON.stringify([targetTile.tileX, targetTile.tileY])); setDiagnostic("dropBlocked", String(!dropTarget));
        const placement = state.ui.pendingBuildPlacement; ghost.visible = state.ui.buildGhostMode && Boolean(placement); if (placement) { ghost.position.set(placement.tileX - 256 + 1.5, 0.04, placement.tileY - 256 + 1.5); ghost.material.color.setHex(isGhostTileBlocked(state, placement.tileX, placement.tileY) ? 0xff675e : 0x75efb0); }
    };
    const updateCollapse = (state: ClientState, dt: number) => {
        if (preview.collapse <= 0) return;
        preview.collapse += dt;
        for (let i = collapsing.length - 1; i >= 0; i--) {
            const entry = collapsing[i]!;
            if (preview.collapse < entry.delay) continue;
            releaseDestroyedModel(entry.root, Boolean(entry.root.userData.previewDefenseId));
            cannon.blast({ x: entry.root.position.x, y: .3, z: entry.root.position.z });
            collapsing.splice(i, 1);
        }
        if (preview.collapse > 3) {
            const buildings = [...state.buildings.values()], defenses = [...state.defenses.keys()];
            state.buildings.clear(); state.defenses.clear(); state.factoryStock.clear();
            removeDestroyedCargo(state, { buildings, defenses, blasts: [], hazards: [] });
            collapsing.length = 0; preview.collapse = 0;
        }
    };
    const collectDemoCargo = (state: ClientState, x: number, z: number): void => {
        let nearest = -1, distanceSquared = 0.92 * 0.92;
        for (let i = 0; i < cargo.length; i++) { const item = cargo[i]!, dx = item.model.position.x - x, dz = item.model.position.z - z, rangeSquared = dx * dx + dz * dz; if (rangeSquared < distanceSquared) { nearest = i; distanceSquared = rangeSquared; } }
        if (nearest >= 0) { const item = cargo.splice(nearest, 1)[0]!; if (item.hazardId) { state.hazards.delete(item.hazardId); demoFuses.get(item.hazardId)?.dispose(); demoFuses.delete(item.hazardId); } item.model.visible = false; const stored = storedCargo.get(item.type) ?? []; stored.push(item.model); storedCargo.set(item.type, stored); transferInventoryItem(state.inventory, item.type, 1); inventory.notify(`${FACTORY_PRODUCTS[item.type]!.toUpperCase()} · CARGO COLLECTED`); inventory.update(state); }
        else inventory.notify("DRIVE CLOSER TO A PICKUP");

    };
    const collectCargo = (state: ClientState, x: number, z: number) => {
        const collecting = inventory.collectRequested();
        if (collecting && !demoMode) { const type = actions?.collect(); inventory.notify(type !== undefined && type !== null ? `${FACTORY_PRODUCTS[type]!.toUpperCase()} · PICKUP REQUESTED` : state.debug.socketConnected ? "DRIVE CLOSER TO A FRIENDLY PICKUP" : "COMMAND LINK OFFLINE"); }
        else if (demoMode && collecting) collectDemoCargo(state, x, z);
    };
    const updateCargo = (state: ClientState, x: number, z: number) => {
        if (inventory) {
            let nearestSquared = Infinity, nearestX = 0, nearestZ = 0;
            for (const item of cargo) {
                const dx = item.model.position.x - x, dz = item.model.position.z - z;
                const squared = dx * dx + dz * dz;
                if (squared < nearestSquared) { nearestSquared = squared; nearestX = dx; nearestZ = dz; }
            }
            setDiagnostic("cargoDistance", Math.sqrt(nearestSquared).toFixed(3));
            setDiagnostic("cargoOffset", JSON.stringify([nearestX, nearestZ]));
        }
        collectCargo(state, x, z);
    };
    const updateCombat = (state: ClientState, dt: number, seconds: number, weapon: import("./demo-combat.js").DemoWeapon) => {
        projectileCollider.beginFrame();
        if (cannon) {
            preview.audioEnabled = state.ui.audioEnabled;
            if (!demoMode && state.controls.shoot) actions?.fire();
            const stats = cannon.update(dt, demoMode && state.controls.shoot, state.local.direction, weapon, demoMode ? undefined : networkCombat.frame(state));
            setDiagnostic("weapon", weapon);
            setDiagnostic("cargo", String(cargo.length));
            setDiagnostic("shotsFired", String(stats.shotsFired));
            setDiagnostic("impacts", String(stats.impacts));
            setDiagnostic("metalImpacts", String(stats.metalImpacts));
            setDiagnostic("rockImpacts", String(stats.rockImpacts));
            setDiagnostic("projectiles", String(stats.projectiles));
            setDiagnostic("projectileTravel", stats.projectileTravel.toFixed(3));
            setDiagnostic("tankHeading", state.local.direction.toFixed(2));
            setDiagnostic("turretShots", String(stats.turretShots));
            setDiagnostic("tankHits", String(stats.tankHits));
        }
        if (turrets) {
            const stats = turrets.update(seconds, dt);
            setDiagnostic("turrets", String(stats.count));
            setDiagnostic("turretsTracking", String(stats.tracking));
            setDiagnostic("turretsVisible", String(stats.visible));
        }
    };
    const publishDiagnostics = (state: ClientState) => {
        setDiagnostic("drawCalls", String(renderer.info.render.calls));
        setDiagnostic("triangles", String(renderer.info.render.triangles));
        setDiagnostic("tankPosition", JSON.stringify([state.local.x, state.local.y]));
        const destruction = cannon.destructionStats;
        setDiagnostic("blastBursts", String(destruction.bursts)); setDiagnostic("collapsingBuildings", String(destruction.collapsing)); setDiagnostic("blastDebris", String(destruction.fragments)); setDiagnostic("blastClouds", String(destruction.clouds));
        setDiagnostic("movementClock", "frame");
        setDiagnostic("movementAck", String(state.movement.lastAck));
        setDiagnostic("movementPending", String(state.movement.pending.length));
        setDiagnostic("movementCorrection", state.movement.correctionPx.toFixed(3));
        setDiagnostic("movementMaxCorrection", state.movement.maxCorrectionPx.toFixed(3));
        setDiagnostic("movementBufferedMs", state.movement.pendingMs.toFixed(1));
        setDiagnostic("movementServerClippedMs", state.movement.serverClippedMs.toFixed(1));
        setDiagnostic("remotePlayers", String(state.remotePlayers.size));
        setDiagnostic("liveBuildings", String(state.buildings.size));
        setDiagnostic("populationHouse", state.ui.selectedPopulationHouseId ?? "");
        let connections = 0;
        if (state.ui.selectedPopulationHouseId) {
            for (const building of state.buildings.values()) if (building.attachedHouseId === state.ui.selectedPopulationHouseId) connections++;
        }
        setDiagnostic("populationConnections", String(connections));
    };
    const shakeGround = createOrbGroundShake(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    const render = (state: ClientState): void => {
        const renderStart = performance.now();
        let stageStart = renderStart;
        const finishStage = (name: string): void => { const now = performance.now(); stageTimes[name] = now - stageStart; stageStart = now; };
        renderer.info.reset();
        const seconds = performance.now() / 1000;
        heatPass.uniforms.heatTime!.value = seconds;
        const dt = Math.min(seconds - lastSeconds, 0.1);
        lastSeconds = seconds;
        updateDemoDestruction(state);
        terrain.update(seconds);
        deployedPreview.forEach(deployment => deployment.update(dt));
        updatePlacement(state);
        const position = { x: state.local.x + state.movement.visualOffsetX, y: state.local.y + state.movement.visualOffsetY };
        liveWorld?.update(state, dt); orbVictory.update(state, dt); populationDisplay.update(state, seconds);
        setDiagnostic("orbAge", String(preview.collapse));
        updateCollapse(state, dt);
        tank.visible = demoMode || Boolean(state.local.id && state.local.health > 0);
        const x = (position.x + TILE_SIZE / 2) / TILE_SIZE - 256;
        const z = (position.y + TILE_SIZE / 2) / TILE_SIZE - 256;
        positionBattlefieldCamera(camera, x, z);
        shakeGround(state, camera);
        camera.updateMatrixWorld();
        displayFrustum.setFromProjectionMatrix(displayProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        finishStage("world");
        lavaEffects.update(seconds, x, z, window.innerWidth, window.innerHeight);
        buildingEffects.update(seconds, dt);
        for (const effects of machinery.values()) effects.update(seconds, dt);
        industrialEffects.update(seconds);
        finishStage("animation");
        researchDisplays.update(state, seconds, x, z, displayFrustum);
        setDiagnostic("researchStates", researchDisplays.statusSignature);
        finishStage("research");
        const heading = state.local.direction / 32 * Math.PI * 2;
        tank.position.set(x, 0, z);
        tank.rotation.y = -heading;
        updateTankRole(tank, isMayorTank(state, state.local.id)); setDiagnostic("tankRole", String(tank.userData.tankRole));
        updateTankTeam(tank, false, state.local.isScoreLeader);
        setDiagnostic("tankFinish", state.local.isScoreLeader ? "gold" : "standard");
        tankCloak.update((state.local.cloakedUntil ?? 0) > Date.now());
        const weapon = inventory?.update(state) ?? "cannon";
        updateCargo(state, x, z);
        finishStage("interface");
        updateCombat(state, dt, seconds, weapon);
        finishStage("combat");
        sun.position.set(x - 9, 25, z - 8);
        sun.target.position.set(x, 0, z);
        scene.updateMatrixWorld();
        sun.shadow.updateMatrices(sun);
        terrain.updateVisibility(displayFrustum, sun.shadow.getFrustum());
        context.tankNameplates.update(state, camera, tank, liveWorld?.playerModels, window.innerWidth, window.innerHeight);
        finishStage("matrices");
        buildingBatches!.update(true);
        finishStage("batches");
        renderer.shadowMap.needsUpdate = true;
        const drawStart = performance.now();
        renderer.domElement.dataset.sceneCpuMs = (drawStart - renderStart).toFixed(2);
        context.lightWarmup.update();
        composer.render();
        context.lightWarmup.afterRender();
        finishStage("sceneDraw");
        inventory?.render(seconds);
        finishStage("previewDraw");
        if (renderStart - lastProfileAt >= 250) {
            renderer.domElement.dataset.renderStages = JSON.stringify(stageTimes);
            lastProfileAt = renderStart;
        }
        renderer.domElement.dataset.drawSubmitMs = (performance.now() - drawStart).toFixed(2);
        renderer.domElement.dataset.renderCpuMs = (performance.now() - renderStart).toFixed(2);
        publishDiagnostics(state);
    };
    return render;
};
