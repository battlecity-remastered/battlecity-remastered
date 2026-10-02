import type { KnownTypedEventEnvelope } from "@battlecity/protocol";
import { LEGACY_BOMB_FUSE_MS } from "@battlecity/sim-core";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { isThreeDemoMode, type ClientState } from "../../app/state.js";
import type { createThreeGameActions } from "../../app/three-game-actions.js";
import { TILE_SIZE } from "../../gameplay/world-viewport.js";
import { resolveCitySpawn } from "../../world/city-spawn.js";
import type { LoadedMap } from "../../world/map-loader.js";
import { createBattlefieldFrame } from "./battlefield-frame.js";
import { createBattlefieldRenderer, createProductNameplates, loadBattlefieldAssets } from "./battlefield-setup.js";
import { createBombFuse } from "./bomb-fuse.js";
import { createBuildingBatches } from "./building-batches.js";
import { createBattlefieldCamera, resizeBattlefieldCamera } from "./camera.js";
import { createCannonEffects } from "./cannon-effects.js";
import { createDefenseTurrets } from "./defense-turrets.js";
import { createDeployedDefense } from "./deployed-defense.js";
import { createBuildingEffects, createIndustrialEffects, createLavaEffects } from "./effects.js";
import { createHeatOutputPass } from "./heat-pass.js";
import { FACTORY_PRODUCTS, factoryProduct, type DemoDefense, type IndustrialBuilding } from "./industrial-demo.js";
import { transferInventoryItem } from "./inventory-model.js";
import { createInventoryPanel } from "./inventory-panel.js";
import { createLiveWorld } from "./live-world.js";
import { MultisampleScenePass } from "./multisample-scene-pass.js";
import { createNetworkCombat } from "./network-combat.js";
import { createOrbVictoryEffects } from "./orb-victory-effects.js";
import { createPlacementPreviews } from "./placement-previews.js";
import { createPopulationDisplay } from "./population-display.js";
import { prepareCityModels } from "./prepare-city-models.js";
import { createProjectileCollider } from "./projectile-collider.js";
import { createResearchDisplays } from "./research-display.js";
import { createSupportBuilding, setSupportBuildingTemplate } from "./support-buildings.js";
import { applySurfaceFinish } from "./surface-finish.js";
import { createTankCloak } from "./tank-cloak.js";
import { resolveTankDropTarget } from "./tank-drop-target.js";
import { createRoleTank } from "./tank-role.js";
import { createTerrain } from "./terrain.js";
export type ThreeBattlefield = {
    canvas: HTMLCanvasElement;
    render: (state: ClientState) => void;
    prepare: (state: ClientState) => Promise<void>;
    observeServerEvent: (event: KnownTypedEventEnvelope, state: ClientState) => void;
    pickBuilding: (clientX: number, clientY: number, state: ClientState) => ClientState["buildings"] extends Map<string, infer B> ? B | null : never;
    pickGround: (clientX: number, clientY: number) => { tileX: number; tileY: number } | null;
    resize: () => void;
    previewBuild: (type: number, tileX: number, tileY: number) => void;
    previewRemove: (tileX: number, tileY: number) => void;
    previewOrb: (state: ClientState) => boolean;
    dispose: () => void;
};
export const createThreeBattlefield = async (mapData: LoadedMap, industrialBuildings: ReadonlyArray<IndustrialBuilding> = [], defenses: ReadonlyArray<DemoDefense> = [], actions?: ReturnType<typeof createThreeGameActions>): Promise<ThreeBattlefield> => {
    const demoMode = isThreeDemoMode();
    const { scene, renderer, setDiagnostic, environment, sun } = createBattlefieldRenderer();
    const { tankAsset, centerAsset, groundTexture, industrialAssets, mayorAsset } = await loadBattlefieldAssets(renderer);
    const terrain = createTerrain(mapData, scene, groundTexture);
    const ballisticFloor = (x: number, z: number): number => mapData.map[Math.floor(x + 256)]?.[Math.floor(z + 256)] === 1 ? -1.05 : 0.005;
    const projectileCollider = createProjectileCollider(ballisticFloor);
    for (const child of scene.children) if (child.userData.ballisticSurface === "rock") projectileCollider.register(child, "rock");
    const lavaEffects = createLavaEffects(mapData, scene);
    const buildingEffects = createBuildingEffects(centerAsset.scene, centerAsset.animations);
    const industrialEffects = createIndustrialEffects();
    const researchDisplays = createResearchDisplays(renderer, environment.texture);
    const { nameplates, addProductNameplate } = createProductNameplates();
    const machinery = new Map<string, ReturnType<typeof createBuildingEffects>>();
    const cargo: Array<{ type: number; model: THREE.Object3D; hazardId?: string; factoryTileX?: number; factoryTileY?: number }> = [];
    const demoFuses = new Map<string, ReturnType<typeof createBombFuse>>();
    let hazardSequence = 0;
    const storedCargo = new Map<number, THREE.Object3D[]>();
    prepareModels();
    function prepareModels() {
        for (const [name, asset] of industrialAssets) {
            if (asset) machinery.set(name, createBuildingEffects(asset.scene, asset.animations));
        }
        applySurfaceFinish(tankAsset.scene);
        applySurfaceFinish(mayorAsset.scene);
        applySurfaceFinish(centerAsset.scene);
        for (const asset of industrialAssets.values()) if (asset) applySurfaceFinish(asset.scene);
        for (const asset of [tankAsset, mayorAsset, centerAsset, ...industrialAssets.values()]) {
            if (!asset) continue;
            asset.scene.traverse(child => {
                if (child instanceof THREE.Mesh) {
                    child.castShadow = true;
                    child.receiveShadow = true;
                }
            });
        }
        industrialAssets.get("housing")!.scene.traverse(part => { if (part instanceof THREE.Mesh) { const materials = Array.isArray(part.material) ? part.material : [part.material]; for (const material of materials) if (material instanceof THREE.MeshStandardMaterial && !/glow/i.test(material.name)) { material.envMapIntensity = .55; material.roughness = Math.max(.52, material.roughness); } } });
        addProductNameplate(industrialAssets.get("housing")!.scene, "HOUSING", new THREE.Vector3(0, .92, 1.20));
        setSupportBuildingTemplate(300, industrialAssets.get("housing")!.scene);
    };
    const tank = createRoleTank(tankAsset.scene, mayorAsset.scene);
    const remoteTankTemplate = tank.clone(true);
    const tankCloak = createTankCloak(tank);
    const batchableBuildings: THREE.Object3D[] = [];
    scene.add(tank);
    addCommandCenters();
    function addCommandCenters() {
        for (let x = 0; x < mapData.map.length; x++)
            for (let z = 0; z < mapData.map.length; z++) {
                if (mapData.map[x]?.[z] !== 3)
                    continue;
                const center = centerAsset.scene.clone(true);
                // glTF converts Blender +Y to -Z: rotate to face the southern apron.
                center.rotation.y = Math.PI;
                center.position.set(x - 256 + 1.5, 0, z - 256 + 1);
                scene.add(center);
                center.userData.commandCenter = true; center.userData.renderTileX = x; center.userData.renderTileY = z; batchableBuildings.push(center);
                buildingEffects.register(center);
                projectileCollider.register(center, "metal");
            }
    };
    let buildingBatches: ReturnType<typeof createBuildingBatches> | undefined;
    const registerResearch = (building: IndustrialBuilding, model: THREE.Object3D) => {
        if (building.kind === "research") {
            const researched = FACTORY_PRODUCTS[building.type === 413 ? 8 : building.type - 400];
            const specimen = industrialAssets.get(`${researched}-item`);
            if (specimen && researched) {
                researchDisplays.register(model, specimen.scene, researched, building.type, demoMode && building.type === 401 && industrialBuildings.some(site => site.type === 401 && site.tileX === building.tileX && site.tileY === building.tileY));
                addProductNameplate(model, `${researched} R&D`, new THREE.Vector3(-0.66, 0.86, -1.79));
            }
        }
    };
    const createIndustrialVisual = (building: IndustrialBuilding): THREE.Object3D => {
        const product = factoryProduct(building);
        const modelName = building.kind === "research" ? "research-center" : building.kind === "orb-factory" ? "orb-factory"
            : product === "rocket" || product === "mine" ? `${product}-factory` : "weapon-factory";
        const asset = industrialAssets.get(modelName);
        if (!asset) throw new Error(`Missing building asset: ${modelName}`);
        const model = asset.scene.clone(true);
        model.rotation.y = Math.PI;
        model.position.set(building.tileX - 256 + 1.5, 0, building.tileY - 256 + 1);
        scene.add(model);
        model.userData.renderTileX = building.tileX; model.userData.renderTileY = building.tileY; if (demoMode) batchableBuildings.push(model);
        machinery.get(modelName)?.register(model);
        industrialEffects.registerBuilding(model, building.kind);
        if (product) addProductNameplate(model, product);
        registerResearch(building, model);
        const itemName = `${product}-item`;
        const itemAsset = industrialAssets.get(itemName);
        if (itemAsset && demoMode) {
            const item = itemAsset.scene.clone(true);
            item.position.set(building.tileX - 256 + 1.5, product === "orb" ? 0.10 : 0.048, building.tileY - 256 + 2.5);
            scene.add(item);
            cargo.push({ type: building.type - 100, model: item, factoryTileX: building.tileX, factoryTileY: building.tileY });
            machinery.get(itemName)?.register(item);
            if (product === "orb") industrialEffects.registerOrb(item);
        }
        if (itemAsset && modelName === "weapon-factory") {
            const assembly = itemAsset.scene.clone(true);
            assembly.position.set(0, 1.56, -0.06);
            assembly.rotation.y = Math.PI;
            assembly.scale.setScalar(1.35);
            model.add(assembly);
            machinery.get(itemName)?.register(assembly);
        }
        if (demoMode) projectileCollider.register(model, "metal");
        buildingBatches?.register(model);
        return model;
    };
    for (const building of industrialBuildings) createIndustrialVisual(building);
    const preview = { audioEnabled: true, collapse: 0 };
    const cannon = createCannonEffects(scene, tank, projectileCollider.sweep, () => preview.audioEnabled, ballisticFloor);
    const networkCombat = createNetworkCombat();
    const orbVictory = createOrbVictoryEffects(scene);
    const populationDisplay = createPopulationDisplay(scene);
    const collapsing: Array<{ root: THREE.Object3D; scale: THREE.Vector3; y: number; delay: number }> = [];
    const turrets = demoMode ? createDefenseTurrets(tank, projectileCollider.sweep, cannon.launch) : null;
    const turretAsset = industrialAssets.get("defense-turret");
    const addDemoTurrets = (): void => {
        if (turrets && turretAsset) {
            projectileCollider.setTarget(tank);
            for (const defense of defenses) {
                const model = turretAsset.scene.clone(true);
                model.position.set(defense.tileX - 256 + 0.5, 0, defense.tileY - 256 + 0.5);
                model.userData.previewDefenseId = `demo-defense-${defense.tileX}-${defense.tileY}`;
                scene.add(model);
                machinery.get("defense-turret")?.register(model);
                turrets.register(model);
                projectileCollider.register(model, "metal");
            }
        }
    };
    addDemoTurrets();
    const inventoryTemplates = new Map<number, THREE.Object3D>();
    FACTORY_PRODUCTS.forEach((product, type) => { const asset = industrialAssets.get(`${product}-item`); if (asset) inventoryTemplates.set(type, asset.scene); });
    const deployedPreview: ReturnType<typeof createDeployedDefense>[] = [];
    const addDroppedCargo = (type: number, state: ClientState, template: THREE.Object3D, placement: NonNullable<ReturnType<typeof resolveTankDropTarget>>): void => {
        const recycled = storedCargo.get(type)?.pop(), model = recycled ?? template.clone(true);
        model.position.set(placement.tileX - 256 + 0.5, type === 5 ? 0.10 : 0.048, placement.tileY - 256 + 0.5); model.visible = true;
        if (!recycled) { scene.add(model); machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model); if (type === 5) industrialEffects.registerOrb(model); }
        const hazardId = `demo-cargo-${++hazardSequence}`;
        state.hazards.set(hazardId, { id: hazardId, cityId: state.local.city, type, x: placement.x, y: placement.y, radius: 48, armed: type === 3 ? state.ui.bombArmed : true, active: type === 3 ? state.ui.bombArmed : true, ...(type === 3 && state.ui.bombArmed ? { fuseEndsAt: Date.now() + LEGACY_BOMB_FUSE_MS } : {}) });
        if (type === 3) demoFuses.set(hazardId, createBombFuse(model));
        cargo.push({ type, model, hazardId });
    };
    const inventory = createInventoryPanel(renderer, environment.texture, inventoryTemplates, (type, state) => {
        if (!demoMode) return actions?.deploy(type) ?? false;
        if (type === 5) return actions?.deploy(type) ?? false;
        const template = inventoryTemplates.get(type);
        if (!template || cargo.length >= 64 || (state.inventory.get(type) ?? 0) <= 0) return false;
        const occupied = new Set([...cargo.map(item => `${Math.floor(item.model.position.x + 256)},${Math.floor(item.model.position.z + 256)}`), ...deployedPreview.map(item => `${Math.floor(item.root.position.x + 256)},${Math.floor(item.root.position.z + 256)}`)]);
        const placement = resolveTankDropTarget(state, occupied);
        if (!placement || !transferInventoryItem(state.inventory, type, -1)) return false;
        if (type >= 8 && type <= 11) { const deployed = createDeployedDefense(type, turretAsset!.scene, template); deployed.root.userData.previewDefenseId = `demo-defense-${placement.tileX}-${placement.tileY}`; deployed.root.position.set(placement.tileX - 256 + .5, 0, placement.tileY - 256 + .5); scene.add(deployed.root); deployedPreview.push(deployed); deployed.update(2); projectileCollider.register(deployed.root, "metal"); deployed.reveal(); state.defenses.set(`demo-defense-${placement.tileX}-${placement.tileY}`, { id: `demo-defense-${placement.tileX}-${placement.tileY}`, cityId: state.local.city, type, tileX: placement.tileX, tileY: placement.tileY, health: 100, maxHealth: 100 }); if (type !== 8) turrets?.register(deployed.root); return true; }
        addDroppedCargo(type, state, template, placement);
        return true;
    }, (type, model) => machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model), { map: mapData.map, buildings: industrialBuildings, defenses }, !demoMode, type => actions?.deploy(type, true) ?? false);
    const liveWorld = demoMode ? null : createLiveWorld(scene, remoteTankTemplate, inventoryTemplates, industrialAssets.get("defense-turret")!.scene, createIndustrialVisual, (type, model) => { machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model); if (type === 5) industrialEffects.registerOrb(model); }, model => { buildingBatches?.unregister(model); for (const effects of machinery.values()) effects.unregister(model); industrialEffects.unregister(model); researchDisplays.unregister(model); }, cannon.destroy, model => buildingBatches?.register(model));
    buildingBatches = createBuildingBatches(scene, batchableBuildings);
    // The color, AO and shadow passes consume the same prepared transforms.
    scene.matrixWorldAutoUpdate = false; scene.matrixAutoUpdate = false;
    const { ghost, dropReticle } = createPlacementPreviews(scene);
    const camera = createBattlefieldCamera(window.innerWidth, window.innerHeight); camera.layers.enable(1);
    const createPostprocessing = () => {
        const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
        const composer = new EffectComposer(renderer, renderTarget);
        composer.addPass(new MultisampleScenePass(scene, camera));
        const ambientOcclusion = new GTAOPass(scene, camera, 1, 1);
        terrain.configureDepthMaterial(ambientOcclusion.normalMaterial);
        // Fire/smoke billboards contribute colour, never flat planes to AO depth.
        const renderOcclusion = ambientOcclusion.render.bind(ambientOcclusion);
        ambientOcclusion.render = (...args) => { const mask = camera.layers.mask; camera.layers.disable(1); try { renderOcclusion(...args); } finally { camera.layers.mask = mask; } };
        ambientOcclusion.updateGtaoMaterial({ radius: 0.48, thickness: 0.35, distanceExponent: 2, distanceFallOff: 1, scale: 1 });
        ambientOcclusion.blendIntensity = 0.72;
        ambientOcclusion.updatePdMaterial({ radius: 2 });
        composer.addPass(ambientOcclusion);
        const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.30, 0.18, 0.72);
        composer.addPass(bloom);
        const heatPass = createHeatOutputPass();
        composer.addPass(heatPass);
        const resize = (): void => {
            const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
            renderer.setSize(width, height);
            composer.setSize(width, height);
            ambientOcclusion.setSize(Math.max(1, Math.floor(width * renderer.getPixelRatio() * 0.5)), Math.max(1, Math.floor(height * renderer.getPixelRatio() * 0.5)));
            heatPass.uniforms.heatResolution!.value.set(width * renderer.getPixelRatio(), height * renderer.getPixelRatio());
            resizeBattlefieldCamera(camera, width, height);
            const shadowRadius = Math.max(width, height) / TILE_SIZE / 2 + 6;
            sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowRadius;
            sun.shadow.camera.right = sun.shadow.camera.top = shadowRadius;
            sun.shadow.camera.updateProjectionMatrix();
        };
        return { composer, heatPass, resize };
    };
    const displayFrustum = new THREE.Frustum(), displayProjection = new THREE.Matrix4();
    const { composer, heatPass, resize } = createPostprocessing();
    resize();
    await cannon.prepareDestruction(renderer, camera);
    const render = createBattlefieldFrame({
        demoMode, scene, renderer, setDiagnostic, heatPass, terrain, deployedPreview,
        cargo, demoFuses, machinery, industrialEffects, researchDisplays, projectileCollider, cannon, turrets,
        dropReticle, ghost, liveWorld, orbVictory, populationDisplay, preview, collapsing, tank, camera,
        displayFrustum, displayProjection, lavaEffects, buildingEffects, tankCloak, inventory, actions,
        storedCargo, networkCombat, sun, buildingBatches, composer
    });
    const raycaster = new THREE.Raycaster(), floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    return {
        canvas: renderer.domElement, render, resize,
        prepare: async state => {
            const start = performance.now();
            liveWorld?.update(state, 0); scene.updateMatrixWorld(); buildingBatches!.update(true);
            await prepareCityModels(renderer, scene, camera, [tank, centerAsset.scene, ...[...industrialAssets.values()].map(asset => asset.scene), ...scene.children.filter(root => root.userData.renderTileX !== undefined)]);
            await researchDisplays.prepare();
            setDiagnostic("cityPrepareMs", (performance.now() - start).toFixed(0));
        },
        previewBuild: (type, tileX, tileY) => { if (!demoMode) return; if (type >= 400 || (type >= 100 && type <= 112)) { createIndustrialVisual({ type, tileX, tileY, kind: type >= 400 ? "research" : type === 105 ? "orb-factory" : "factory" }); } else { const model = createSupportBuilding(type); model.position.set(tileX - 256 + 1.5, 0, tileY - 256 + (type === 200 ? 1 : 1.5)); model.userData.renderTileX = tileX; model.userData.renderTileY = tileY; scene.add(model); projectileCollider.register(model, "metal"); } },
        previewRemove: (tileX, tileY) => { if (!demoMode) return; for (const model of scene.children) if (model.userData.renderTileX === tileX && model.userData.renderTileY === tileY) { model.visible = false; projectileCollider.unregister(model); } },
        previewOrb: state => {
            if (!demoMode || (state.inventory.get(5) ?? 0) <= 0) return false; const city = resolveCitySpawn(state.local.city); if (!city) return false; const x = (state.local.x + 24) / 48, y = (state.local.y + 24) / 48; if (x < city.tileX || x > city.tileX + 3 || y < city.tileY + 2 || y > city.tileY + 3) return false; if (preview.collapse > 0) return false; preview.collapse = .001;
            for (const root of scene.children) { if ([...state.buildings.values()].some(building => root.userData.renderTileX === building.tileX && root.userData.renderTileY === building.tileY)) { collapsing.push({ root, scale: root.scale.clone(), y: root.position.y, delay: .3 + Math.hypot(root.position.x - (city.tileX - 254.5), root.position.z - (city.tileY - 254.5)) * .035 }); } }
            state.inventory.set(5, (state.inventory.get(5) ?? 0) - 1); state.events.lastOrbEvent = { sourceCityId: state.local.city, targetCityId: state.local.city, by: state.local.id!, awardedScore: 0, at: Date.now() }; return true;
        },
        observeServerEvent: (event, state) => { networkCombat.observe(event, state); liveWorld?.observe(event); },
        pickBuilding: (clientX, clientY, state) => { raycaster.setFromCamera(new THREE.Vector2(clientX / window.innerWidth * 2 - 1, 1 - clientY / window.innerHeight * 2), camera); const roots = scene.children.filter(root => root.visible && root.userData.renderTileX !== undefined && [...state.buildings.values()].some(building => building.tileX === root.userData.renderTileX && building.tileY === root.userData.renderTileY)); const hit = raycaster.intersectObjects(roots, true)[0]; if (!hit) return null; let root: THREE.Object3D = hit.object; while (root.parent && root.parent !== scene) root = root.parent; return [...state.buildings.values()].find(building => building.tileX === root.userData.renderTileX && building.tileY === root.userData.renderTileY) ?? null; },
        pickGround: (clientX, clientY) => { raycaster.setFromCamera(new THREE.Vector2(clientX / window.innerWidth * 2 - 1, 1 - clientY / window.innerHeight * 2), camera); const point = raycaster.ray.intersectPlane(floor, new THREE.Vector3()); return point ? { tileX: Math.floor(point.x + 256), tileY: Math.floor(point.z + 256) } : null; },
        dispose: () => {
            for (const fuse of demoFuses.values()) fuse.dispose();
            populationDisplay.dispose();
            orbVictory.dispose();
            tankCloak.dispose();
            environment.dispose();
            researchDisplays.dispose();
            cannon?.dispose();
            deployedPreview.forEach(deployment => deployment.dispose());
            inventory?.dispose();
            buildingBatches!.dispose();
            buildingEffects.dispose();
            for (const effects of machinery.values()) effects.dispose();
            groundTexture.dispose();
            nameplates.forEach(texture => texture.dispose());
            terrain.dispose();
            composer.passes.forEach(pass => pass.dispose());
            composer.dispose();
            scene.traverse(child => {
                if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.Line) {
                    child.geometry.dispose();
                    const materials = Array.isArray(child.material) ? child.material : [child.material];
                    materials.forEach(material => material.dispose());
                }
            });
            renderer.dispose();
            renderer.domElement.remove();
        }
    };
};
