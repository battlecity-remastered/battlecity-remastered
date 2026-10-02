import { LEGACY_BOMB_FUSE_MS } from "@battlecity/sim-core";
import { detonateDemoBombs } from "../../app/demo-bombs.js";
import { createBombFuse } from "./bomb-fuse.js";
import { createPopulationDisplay } from "./population-display.js";
import { resolveCitySpawn } from "../../world/city-spawn.js";
import { createRoleTank, updateTankRole, isMayorTank } from "./tank-role.js";
import { createSupportBuilding, setSupportBuildingTemplate } from "./support-buildings.js";
import { createDeployedDefense } from "./deployed-defense.js";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { GTAOPass } from "three/addons/postprocessing/GTAOPass.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { MultisampleScenePass } from "./multisample-scene-pass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { isThreeDemoMode, type ClientState } from "../../app/state.js";
import type { LoadedMap } from "../../world/map-loader.js";
import type { KnownTypedEventEnvelope } from "@battlecity/protocol";
import type { createThreeGameActions } from "../../app/three-game-actions.js";
import { createOrbVictoryEffects } from "./orb-victory-effects.js";
import { createNetworkCombat } from "./network-combat.js";
import { resolveTankDropTarget } from "./tank-drop-target.js";
import { resolvePlayerDominantTile } from "../../gameplay/items/drop-placement.js";
import { isGhostTileBlocked } from "../../ui/build-menu/GhostPlacement.js";
import { createTankCloak } from "./tank-cloak.js";
import { createLiveWorld } from "./live-world.js";
import { createTerrain } from "./terrain.js";
import { createBattlefieldCamera, positionBattlefieldCamera, resizeBattlefieldCamera } from "./camera.js";
import { TILE_SIZE } from "../../gameplay/world-viewport.js";
import { createBuildingEffects, createLavaEffects, createIndustrialEffects } from "./effects.js";
import { FACTORY_PRODUCTS, factoryProduct, type IndustrialBuilding, type DemoDefense } from "./industrial-demo.js";
import { applySurfaceFinish, createOutdoorEnvironment } from "./surface-finish.js";
import { createHeatOutputPass } from "./heat-pass.js";
import { createResearchDisplays } from "./research-display.js";
import { createProjectileCollider } from "./projectile-collider.js";
import { createCannonEffects } from "./cannon-effects.js";
import { createDefenseTurrets } from "./defense-turrets.js";
import { createInventoryPanel } from "./inventory-panel.js";
import { transferInventoryItem } from "./inventory-model.js";
import { createBuildingBatches } from "./building-batches.js";
export type ThreeBattlefield = {
    canvas: HTMLCanvasElement;
    render: (state: ClientState) => void;
    observeServerEvent: (event: KnownTypedEventEnvelope, state: ClientState) => void;
    pickBuilding: (clientX:number,clientY:number,state:ClientState) => ClientState["buildings"] extends Map<string,infer B>?B|null:never;
    pickGround: (clientX: number, clientY: number) => {tileX: number;tileY: number} | null;
    resize: () => void;
    previewBuild: (type:number,tileX:number,tileY:number) => void;
    previewRemove: (tileX:number,tileY:number) => void;
    previewOrb: (state:ClientState) => boolean;
    dispose: () => void;
};
export const createThreeBattlefield = async (mapData: LoadedMap, industrialBuildings: ReadonlyArray<IndustrialBuilding> = [],defenses: ReadonlyArray<DemoDefense> = [], actions?: ReturnType<typeof createThreeGameActions>): Promise<ThreeBattlefield> => {
    const demoMode=isThreeDemoMode();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x625b54);
    scene.fog = new THREE.FogExp2(0x625b54, 0.004);
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    // Stable diagnostics should not issue repeated DOM attribute mutations.
    // Frame timing fields still publish every frame for performance observers.
    const setDiagnostic = (name: string, value: string): void => {
        if (renderer.domElement.dataset[name] !== value) renderer.domElement.dataset[name] = value;
    };
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.shadowMap.enabled = true;
    // The color pass updates shadows once; AO and item previews reuse them.
    renderer.shadowMap.autoUpdate=false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.info.autoReset=false;
    setDiagnostic("renderer", "three-battlefield");
    const gl=renderer.getContext(),gpuInfo=gl.getExtension("WEBGL_debug_renderer_info");
    setDiagnostic("gpuRenderer", String(gl.getParameter(gpuInfo?.UNMASKED_RENDERER_WEBGL??gl.RENDERER)));
    Object.assign(renderer.domElement.style, { position: "absolute", inset: "0", zIndex: "0" });
    // Reflected light gives the original chrome/teal palette readable metal surfaces.
    const environment = createOutdoorEnvironment(renderer);
    scene.environment = environment.texture;
    scene.environmentIntensity = 0.80;
    scene.add(new THREE.HemisphereLight(0xa7bed5, 0x493323, 0.42));
    const sun = new THREE.DirectionalLight(0xffd6ae, 2.7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -13;
    sun.shadow.camera.right = 13;
    sun.shadow.camera.top = 13;
    sun.shadow.camera.bottom = -13;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.normalBias = 0.028;
    sun.shadow.bias = -0.00015;
    scene.add(sun, sun.target);
    const loader = new GLTFLoader();
    const loadIndustrial = (name: string) => loader.loadAsync(`/assets/models/battlecity-${name}.glb`);
    const industrialNames = ["housing", "rocket-factory", "mine-factory", "weapon-factory", "research-center", "orb-factory", "defense-turret", ...FACTORY_PRODUCTS.map(product => `${product}-item`)];
    const [tankAsset, centerAsset, groundTexture, industrialAssets, mayorAsset] = await Promise.all([
        loader.loadAsync("/assets/models/battlecity-tank.glb"),
        loader.loadAsync("/assets/models/battlecity-command-center.glb"),
        new THREE.TextureLoader().loadAsync("/assets/materials/dx-mineral-ground.png"),
        Promise.all(industrialNames.map(async name => [name, await loadIndustrial(name)] as const)).then(entries => new Map(entries)),
        loader.loadAsync("/assets/models/battlecity-mayor-tank.glb")
    ]);
    groundTexture.colorSpace = THREE.SRGBColorSpace;
    groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
    groundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const terrain = createTerrain(mapData, scene, groundTexture);
    const ballisticFloor = (x: number,z: number): number => mapData.map[Math.floor(x+256)]?.[Math.floor(z+256)] === 1 ? -1.05 : 0.005;
    const projectileCollider = createProjectileCollider(ballisticFloor);
    for (const child of scene.children) if (child.userData.ballisticSurface === "rock") projectileCollider.register(child,"rock");
    const lavaEffects = createLavaEffects(mapData, scene);
    const buildingEffects = createBuildingEffects(centerAsset.scene, centerAsset.animations);
    const industrialEffects = createIndustrialEffects();
    const researchDisplays = createResearchDisplays(renderer, environment.texture);
    const nameplates: THREE.Texture[] = [];
    const nameplateFrame = new THREE.BoxGeometry(1.10,0.31,0.025);
    const nameplateSteel = new THREE.MeshStandardMaterial({ color: 0x3c4e50, metalness: 0.72, roughness: 0.38 });
    const addProductNameplate = (model: THREE.Object3D, product: string, position = new THREE.Vector3(0,1.49,-0.86)): void => {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 48;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#101b1e";
        context.fillRect(0,0,256,48);
        context.strokeStyle = "#7d9293";
        context.lineWidth = 2;
        context.strokeRect(4,4,248,40);
        context.fillStyle = "#c4d4ce";
        context.font = "bold 30px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(product.toUpperCase(),128,25);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        nameplates.push(texture);
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0.25, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.12 });
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.05,0.27),material);
        // Tilt the display toward the overhead camera so its lettering remains readable.
        plaque.rotation.set(Math.PI / 3,Math.PI,0);
        plaque.position.copy(position);
        const frame = new THREE.Mesh(nameplateFrame,nameplateSteel);
        frame.quaternion.copy(plaque.quaternion);
        frame.position.copy(position).addScaledVector(new THREE.Vector3(0,0,1).applyQuaternion(plaque.quaternion),-0.014);
        frame.castShadow = frame.receiveShadow = true;
        model.add(frame,plaque);
    };
    const machinery = new Map<string, ReturnType<typeof createBuildingEffects>>();
    const cargo: Array<{type: number;model: THREE.Object3D;hazardId?:string;factoryTileX?:number;factoryTileY?:number}> = [];
    const demoFuses=new Map<string,ReturnType<typeof createBombFuse>>();
    let hazardSequence=0;
    const storedCargo = new Map<number,THREE.Object3D[]>();
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
    industrialAssets.get("housing")!.scene.traverse(part=>{if(part instanceof THREE.Mesh){const materials=Array.isArray(part.material)?part.material:[part.material];for(const material of materials)if(material instanceof THREE.MeshStandardMaterial&&!/glow/i.test(material.name)){material.envMapIntensity=.55;material.roughness=Math.max(.52,material.roughness);}}});
    addProductNameplate(industrialAssets.get("housing")!.scene,"HOUSING",new THREE.Vector3(0,.92,1.20));
    setSupportBuildingTemplate(300,industrialAssets.get("housing")!.scene);
    const tank = createRoleTank(tankAsset.scene,mayorAsset.scene);
    const remoteTankTemplate=tank.clone(true);
    const tankCloak=createTankCloak(tank);
    const batchableBuildings: THREE.Object3D[]=[];
    scene.add(tank);
    for (let x = 0; x < mapData.map.length; x++)
        for (let z = 0; z < mapData.map.length; z++) {
            if (mapData.map[x]?.[z] !== 3)
                continue;
            const center = centerAsset.scene.clone(true);
            // glTF converts Blender +Y to -Z: rotate to face the southern apron.
            center.rotation.y = Math.PI;
            center.position.set(x - 256 + 1.5, 0, z - 256 + 1);
            scene.add(center);
            center.userData.commandCenter=true;center.userData.renderTileX=x;center.userData.renderTileY=z;batchableBuildings.push(center);
            buildingEffects.register(center);
            projectileCollider.register(center,"metal");
        }
    let buildingBatches: ReturnType<typeof createBuildingBatches> | undefined;
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
        model.userData.renderTileX=building.tileX;model.userData.renderTileY=building.tileY;if(demoMode)batchableBuildings.push(model);
        machinery.get(modelName)?.register(model);
        industrialEffects.registerBuilding(model, building.kind);
        if (product) addProductNameplate(model, product);
        if (building.kind === "research") {
            const researched = FACTORY_PRODUCTS[building.type===413?8:building.type - 400];
            const specimen = industrialAssets.get(`${researched}-item`);
            if (specimen && researched) {
                researchDisplays.register(model, specimen.scene, researched, building.type, demoMode && building.type===401 && industrialBuildings.some(site=>site.type===401 && site.tileX===building.tileX && site.tileY===building.tileY));
                addProductNameplate(model, `${researched} R&D`, new THREE.Vector3(-0.66,0.86,-1.79));
            }
        }
        const itemName = `${product}-item`;
        const itemAsset = industrialAssets.get(itemName);
        if (itemAsset && demoMode) {
            const item = itemAsset.scene.clone(true);
            item.position.set(building.tileX - 256 + 1.5, product === "orb" ? 0.10 : 0.048, building.tileY - 256 + 2.5);
            scene.add(item);
            cargo.push({type:building.type-100,model:item,factoryTileX:building.tileX,factoryTileY:building.tileY});
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
        if (demoMode) projectileCollider.register(model,"metal");
        buildingBatches?.register(model);
        return model;
    };
    for (const building of industrialBuildings) createIndustrialVisual(building);
    let cannonAudioEnabled = true;
    const cannon = createCannonEffects(scene,tank,projectileCollider.sweep,() => cannonAudioEnabled,ballisticFloor);
    const networkCombat = createNetworkCombat();
    const orbVictory=createOrbVictoryEffects(scene);
    const populationDisplay=createPopulationDisplay(scene);
    let previewCollapse=0;
    const collapsing:Array<{root:THREE.Object3D;scale:THREE.Vector3;y:number;delay:number}>=[];
    const turrets = demoMode ? createDefenseTurrets(tank,projectileCollider.sweep,cannon.launch) : null;
    const turretAsset = industrialAssets.get("defense-turret");
    if (turrets && turretAsset) {
        projectileCollider.setTarget(tank);
        for (const defense of defenses) {
            const model=turretAsset.scene.clone(true);
            model.position.set(defense.tileX-256+0.5,0,defense.tileY-256+0.5);
            model.userData.previewDefenseId=`demo-defense-${defense.tileX}-${defense.tileY}`;
            scene.add(model);
            machinery.get("defense-turret")?.register(model);
            turrets.register(model);
            projectileCollider.register(model,"metal");
        }
    }
    const inventoryTemplates = new Map<number,THREE.Object3D>();
    FACTORY_PRODUCTS.forEach((product,type)=>{const asset=industrialAssets.get(`${product}-item`);if(asset)inventoryTemplates.set(type,asset.scene);});
    const deployedPreview:ReturnType<typeof createDeployedDefense>[]=[];
    const inventory = createInventoryPanel(renderer,environment.texture,inventoryTemplates,(type,state)=>{
        if (!demoMode) return actions?.deploy(type) ?? false;
        if(type===5)return actions?.deploy(type)??false;
        const template=inventoryTemplates.get(type);
        if(!template || cargo.length>=64 || (state.inventory.get(type)??0)<=0)return false;
        const occupied=new Set([...cargo.map(item=>`${Math.floor(item.model.position.x+256)},${Math.floor(item.model.position.z+256)}`),...deployedPreview.map(item=>`${Math.floor(item.root.position.x+256)},${Math.floor(item.root.position.z+256)}`)]);
        const placement=resolveTankDropTarget(state,occupied);
        if(!placement || !transferInventoryItem(state.inventory,type,-1))return false;
        if(type>=8 && type<=11){const deployed=createDeployedDefense(type,turretAsset!.scene,template);deployed.root.userData.previewDefenseId=`demo-defense-${placement.tileX}-${placement.tileY}`;deployed.root.position.set(placement.tileX-256+.5,0,placement.tileY-256+.5);scene.add(deployed.root);deployedPreview.push(deployed);deployed.update(2);projectileCollider.register(deployed.root,"metal");deployed.reveal();state.defenses.set(`demo-defense-${placement.tileX}-${placement.tileY}`,{id:`demo-defense-${placement.tileX}-${placement.tileY}`,cityId:state.local.city,type,tileX:placement.tileX,tileY:placement.tileY,health:100,maxHealth:100});if(type!==8)turrets?.register(deployed.root);return true;}
        const recycled=storedCargo.get(type)?.pop(),model=recycled??template.clone(true);
        model.position.set(placement.tileX-256+0.5,type===5?0.10:0.048,placement.tileY-256+0.5);model.visible=true;
        if(!recycled){scene.add(model);machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model);if(type===5)industrialEffects.registerOrb(model);}
        const hazardId=`demo-cargo-${++hazardSequence}`;
        state.hazards.set(hazardId,{id:hazardId,cityId:state.local.city,type,x:placement.x,y:placement.y,radius:48,armed:type===3?state.ui.bombArmed:true,active:type===3?state.ui.bombArmed:true,...(type===3&&state.ui.bombArmed?{fuseEndsAt:Date.now()+LEGACY_BOMB_FUSE_MS}:{})});
        if(type===3)demoFuses.set(hazardId,createBombFuse(model));
        cargo.push({type,model,hazardId});
        return true;
    },(type,model)=>machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model),{map:mapData.map,buildings:industrialBuildings,defenses},!demoMode,type=>actions?.deploy(type,true)??false);
    const liveWorld = demoMode ? null : createLiveWorld(scene,remoteTankTemplate,inventoryTemplates,industrialAssets.get("defense-turret")!.scene,createIndustrialVisual,(type,model)=>{machinery.get(`${FACTORY_PRODUCTS[type]}-item`)?.register(model);if(type===5)industrialEffects.registerOrb(model);},model=>{buildingBatches?.unregister(model);for(const effects of machinery.values())effects.unregister(model);industrialEffects.unregister(model);researchDisplays.unregister(model);},cannon.destroy);
    buildingBatches=createBuildingBatches(scene,batchableBuildings);
    // The color, AO and shadow passes consume the same prepared transforms.
    scene.matrixWorldAutoUpdate=false;scene.matrixAutoUpdate=false;
    const ghost=new THREE.Mesh(new THREE.BoxGeometry(3,0.025,3),new THREE.MeshBasicMaterial({color:0x75efb0,transparent:true,opacity:0.23,depthWrite:false}));ghost.visible=false;scene.add(ghost);
    const dropCorners:number[]=[];
    for(const sx of [-1,1])for(const sz of [-1,1]){dropCorners.push(sx*.46,0,sz*.46,sx*.29,0,sz*.46,sx*.46,0,sz*.46,sx*.46,0,sz*.29);}
    const dropReticle=new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position",new THREE.Float32BufferAttribute(dropCorners,3)),new THREE.LineBasicMaterial({color:0x83dfbc,transparent:true,opacity:.62,depthWrite:false}));dropReticle.visible=false;scene.add(dropReticle);
    const camera = createBattlefieldCamera(window.innerWidth, window.innerHeight);camera.layers.enable(1);
    const displayFrustum=new THREE.Frustum(),displayProjection=new THREE.Matrix4();
    const renderTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer:false });
    const composer = new EffectComposer(renderer, renderTarget);
    composer.addPass(new MultisampleScenePass(scene, camera));
    const ambientOcclusion = new GTAOPass(scene,camera,1,1);
    terrain.configureDepthMaterial(ambientOcclusion.normalMaterial);
    // Fire/smoke billboards contribute colour, never flat planes to AO depth.
    const renderOcclusion=ambientOcclusion.render.bind(ambientOcclusion);
    ambientOcclusion.render=(...args)=>{const mask=camera.layers.mask;camera.layers.disable(1);try{renderOcclusion(...args);}finally{camera.layers.mask=mask;}};
    ambientOcclusion.updateGtaoMaterial({radius:0.48,thickness:0.35,distanceExponent:2,distanceFallOff:1,scale:1});
    ambientOcclusion.blendIntensity = 0.72;
    ambientOcclusion.updatePdMaterial({radius:2});
    composer.addPass(ambientOcclusion);
    const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.30, 0.18, 0.72);
    composer.addPass(bloom);
    const heatPass = createHeatOutputPass();
    composer.addPass(heatPass);
    const resize = (): void => {
        const width = Math.max(1, window.innerWidth), height = Math.max(1, window.innerHeight);
        renderer.setSize(width, height);
        composer.setSize(width, height);
        ambientOcclusion.setSize(Math.max(1,Math.floor(width*renderer.getPixelRatio()*0.5)),Math.max(1,Math.floor(height*renderer.getPixelRatio()*0.5)));
        heatPass.uniforms.heatResolution!.value.set(width*renderer.getPixelRatio(),height*renderer.getPixelRatio());
        resizeBattlefieldCamera(camera, width, height);
        const shadowRadius = Math.max(width, height) / TILE_SIZE / 2 + 6;
        sun.shadow.camera.left = sun.shadow.camera.bottom = -shadowRadius;
        sun.shadow.camera.right = sun.shadow.camera.top = shadowRadius;
        sun.shadow.camera.updateProjectionMatrix();
    };
    resize();
    await cannon.prepareDestruction(renderer,camera);
    let lastSeconds = performance.now() / 1000;
    const stageTimes: Record<string,number> = {};
    let lastProfileAt = -Infinity;
    const render = (state: ClientState): void => {
        const renderStart=performance.now();
        let stageStart=renderStart;
        const finishStage=(name:string):void=>{const now=performance.now();stageTimes[name]=now-stageStart;stageStart=now;};
        renderer.info.reset();
        const seconds = performance.now() / 1000;
        heatPass.uniforms.heatTime!.value = seconds;
        const dt = Math.min(seconds - lastSeconds, 0.1);
        lastSeconds = seconds;
        if(demoMode){
            const destroyed=detonateDemoBombs(state,Date.now());
            for(const point of destroyed.blasts)cannon.blast({x:point.x/48-256,y:.3,z:point.y/48-256});
            for(const building of destroyed.buildings)for(const model of scene.children)if(model.userData.renderTileX===building.tileX&&model.userData.renderTileY===building.tileY){projectileCollider.unregister(model);buildingBatches?.unregister(model);for(const effects of machinery.values())effects.unregister(model);industrialEffects.unregister(model);researchDisplays.unregister(model);if(!cannon.destroy(model))model.visible=false;}
            for(const id of destroyed.defenses)for(const model of scene.children)if(model.userData.previewDefenseId===id){projectileCollider.unregister(model);if(!cannon.destroy(model))model.visible=false;turrets?.unregister(model);for(const effects of machinery.values())effects.unregister(model);}
            for(let i=cargo.length-1;i>=0;i--){const item=cargo[i]!;
                const removed=item.hazardId?!state.hazards.has(item.hazardId):destroyed.buildings.some(building=>building.tileX===item.factoryTileX&&building.tileY===item.factoryTileY);
                if(removed){item.model.visible=false;item.model.removeFromParent();if(item.hazardId){demoFuses.get(item.hazardId)?.dispose();demoFuses.delete(item.hazardId);}machinery.get(`${FACTORY_PRODUCTS[item.type]}-item`)?.unregister(item.model);industrialEffects.unregister(item.model);cargo.splice(i,1);}
            }
            for(const [id,fuse] of demoFuses)fuse.update(Date.now(),state.hazards.get(id)?.fuseEndsAt);
        }
        terrain.update(seconds);
        deployedPreview.forEach(deployment=>deployment.update(dt));
        const targetTile=resolvePlayerDominantTile(state),dropTarget=resolveTankDropTarget(state);
        dropReticle.visible=Boolean(state.local.id && state.ui.selectedInventoryItemType!==null && (state.inventory.get(state.ui.selectedInventoryItemType)??0)>0 && !state.ui.buildGhostMode && !state.ui.buildDemolishMode);
        dropReticle.position.set(targetTile.tileX-256+.5,.035,targetTile.tileY-256+.5);dropReticle.material.color.setHex(dropTarget?0x83dfbc:0xf18465);
        setDiagnostic("dropTile", JSON.stringify([targetTile.tileX,targetTile.tileY]));setDiagnostic("dropBlocked", String(!dropTarget));
        const placement=state.ui.pendingBuildPlacement;ghost.visible= state.ui.buildGhostMode && Boolean(placement);if(placement){ghost.position.set(placement.tileX-256+1.5,0.04,placement.tileY-256+1.5);ghost.material.color.setHex(isGhostTileBlocked(state,placement.tileX,placement.tileY)?0xff675e:0x75efb0);}
        const position = state.local;
        liveWorld?.update(state,dt);orbVictory.update(state,dt);populationDisplay.update(state,seconds);
        setDiagnostic("orbAge", String(previewCollapse));
        if(previewCollapse>0){previewCollapse+=dt;for(const entry of collapsing){const phase=THREE.MathUtils.clamp((previewCollapse-entry.delay)/1.6,0,1);entry.root.scale.copy(entry.scale);entry.root.scale.y*=1-phase*.92;entry.root.position.y=entry.y-phase*1.2;entry.root.rotation.z=Math.sin(phase*Math.PI)*.12;entry.root.visible=phase<1;}if(previewCollapse>3){state.buildings.clear();collapsing.length=0;previewCollapse=0;}}
        tank.visible = demoMode || Boolean(state.local.id && state.local.health > 0);
        const x = (position.x + TILE_SIZE / 2) / TILE_SIZE - 256;
        const z = (position.y + TILE_SIZE / 2) / TILE_SIZE - 256;
        positionBattlefieldCamera(camera, x, z);
        camera.updateMatrixWorld();
        displayFrustum.setFromProjectionMatrix(displayProjection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
        finishStage("world");
        lavaEffects.update(seconds, x, z, window.innerWidth, window.innerHeight);
        buildingEffects.update(seconds, dt);
        for (const effects of machinery.values()) effects.update(seconds, dt);
        industrialEffects.update(seconds);
        finishStage("animation");
        researchDisplays.update(state,seconds,x,z,displayFrustum);
        setDiagnostic("researchStates",researchDisplays.statusSignature);
        finishStage("research");
        const heading = state.local.direction / 32 * Math.PI * 2;
        tank.position.set(x, 0, z);
        tank.rotation.y = -heading;
        updateTankRole(tank,isMayorTank(state,state.local.id));setDiagnostic("tankRole", String(tank.userData.tankRole));
        tankCloak.update((state.local.cloakedUntil??0)>Date.now());
        const weapon=inventory?.update(state)??"cannon";
        if(inventory){
            let nearestSquared = Infinity, nearestX = 0, nearestZ = 0;
            for (const item of cargo) {
                const dx = item.model.position.x-x, dz = item.model.position.z-z;
                const squared = dx*dx+dz*dz;
                if (squared < nearestSquared) {nearestSquared = squared; nearestX = dx; nearestZ = dz;}
            }
            setDiagnostic("cargoDistance", Math.sqrt(nearestSquared).toFixed(3));
            setDiagnostic("cargoOffset", JSON.stringify([nearestX,nearestZ]));
        }
        const collecting = inventory.collectRequested();
        if(collecting && !demoMode) {const type=actions?.collect();inventory.notify(type!==undefined&&type!==null?`${FACTORY_PRODUCTS[type]!.toUpperCase()} · PICKUP REQUESTED`:state.debug.socketConnected?"DRIVE CLOSER TO A FRIENDLY PICKUP":"COMMAND LINK OFFLINE");}
        else if(demoMode && collecting) {
            let nearest=-1,distanceSquared=0.92*0.92;
            for(let i=0;i<cargo.length;i++){const item=cargo[i]!,dx=item.model.position.x-x,dz=item.model.position.z-z,rangeSquared=dx*dx+dz*dz;if(rangeSquared<distanceSquared){nearest=i;distanceSquared=rangeSquared;}}
            if(nearest>=0){const item=cargo.splice(nearest,1)[0]!;if(item.hazardId){state.hazards.delete(item.hazardId);demoFuses.get(item.hazardId)?.dispose();demoFuses.delete(item.hazardId);}item.model.visible=false;const stored=storedCargo.get(item.type)??[];stored.push(item.model);storedCargo.set(item.type,stored);transferInventoryItem(state.inventory,item.type,1);inventory.notify(`${FACTORY_PRODUCTS[item.type]!.toUpperCase()} · CARGO COLLECTED`);inventory.update(state);}
            else inventory.notify("DRIVE CLOSER TO A PICKUP");
        }
        finishStage("interface");
        projectileCollider.beginFrame();
        if (cannon) {
            cannonAudioEnabled = state.ui.audioEnabled;
            if (!demoMode && state.controls.shoot) actions?.fire(weapon);
            const stats = cannon.update(dt,demoMode && state.controls.shoot,state.local.direction,weapon,demoMode ? undefined : networkCombat.frame(state));
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
            const stats=turrets.update(seconds,dt);
            setDiagnostic("turrets", String(stats.count));
            setDiagnostic("turretsTracking", String(stats.tracking));
            setDiagnostic("turretsVisible", String(stats.visible));
        }
        finishStage("combat");
        sun.position.set(x - 9, 25, z - 8);
        sun.target.position.set(x, 0, z);
        scene.updateMatrixWorld();
        finishStage("matrices");
        buildingBatches!.update(true);
        finishStage("batches");
        renderer.shadowMap.needsUpdate=true;
        const drawStart=performance.now();
        renderer.domElement.dataset.sceneCpuMs=(drawStart-renderStart).toFixed(2);
        composer.render();
        finishStage("sceneDraw");
        inventory?.render(seconds);
        finishStage("previewDraw");
        if(renderStart-lastProfileAt>=250){
            renderer.domElement.dataset.renderStages=JSON.stringify(stageTimes);
            lastProfileAt=renderStart;
        }
        renderer.domElement.dataset.drawSubmitMs=(performance.now()-drawStart).toFixed(2);
        renderer.domElement.dataset.renderCpuMs=(performance.now()-renderStart).toFixed(2);
        setDiagnostic("drawCalls", String(renderer.info.render.calls));
        setDiagnostic("triangles", String(renderer.info.render.triangles));
        setDiagnostic("tankPosition", JSON.stringify([state.local.x,state.local.y]));
        const destruction=cannon.destructionStats;
        setDiagnostic("blastBursts",String(destruction.bursts));setDiagnostic("collapsingBuildings",String(destruction.collapsing));setDiagnostic("blastDebris",String(destruction.fragments));setDiagnostic("blastClouds",String(destruction.clouds));
        setDiagnostic("movementClock", "frame");
        setDiagnostic("remotePlayers", String(state.remotePlayers.size));
        setDiagnostic("liveBuildings", String(state.buildings.size));
        setDiagnostic("populationHouse", state.ui.selectedPopulationHouseId??"");
        let connections = 0;
        if (state.ui.selectedPopulationHouseId) {
            for (const building of state.buildings.values()) if (building.attachedHouseId === state.ui.selectedPopulationHouseId) connections++;
        }
        setDiagnostic("populationConnections", String(connections));
    };
    const raycaster=new THREE.Raycaster(), floor=new THREE.Plane(new THREE.Vector3(0,1,0),0);
    return { canvas: renderer.domElement, render, resize,
        previewBuild:(type,tileX,tileY)=>{if(!demoMode)return;if(type>=400||(type>=100&&type<=112)){createIndustrialVisual({type,tileX,tileY,kind:type>=400?"research":type===105?"orb-factory":"factory"});}else{const model=createSupportBuilding(type);model.position.set(tileX-256+1.5,0,tileY-256+(type===200?1:1.5));model.userData.renderTileX=tileX;model.userData.renderTileY=tileY;scene.add(model);projectileCollider.register(model,"metal");}},
        previewRemove:(tileX,tileY)=>{if(!demoMode)return;for(const model of scene.children)if(model.userData.renderTileX===tileX&&model.userData.renderTileY===tileY){model.visible=false;projectileCollider.unregister(model);}},
        previewOrb:state=>{if(!demoMode||(state.inventory.get(5)??0)<=0)return false;const city=resolveCitySpawn(state.local.city);if(!city)return false;const x=(state.local.x+24)/48,y=(state.local.y+24)/48;if(x<city.tileX||x>city.tileX+3||y<city.tileY+2||y>city.tileY+3)return false;if(previewCollapse>0)return false;previewCollapse=.001;
            for(const root of scene.children){if([...state.buildings.values()].some(building=>root.userData.renderTileX===building.tileX&&root.userData.renderTileY===building.tileY)){collapsing.push({root,scale:root.scale.clone(),y:root.position.y,delay:.3+Math.hypot(root.position.x-(city.tileX-254.5),root.position.z-(city.tileY-254.5))*.035});}}
            state.inventory.set(5,(state.inventory.get(5)??0)-1);state.events.lastOrbEvent={sourceCityId:state.local.city,targetCityId:state.local.city,by:state.local.id!,awardedScore:0,at:Date.now()};return true;},
        observeServerEvent: (event,state)=>{networkCombat.observe(event,state);liveWorld?.observe(event);},
        pickBuilding:(clientX,clientY,state)=>{raycaster.setFromCamera(new THREE.Vector2(clientX/window.innerWidth*2-1,1-clientY/window.innerHeight*2),camera);const roots=scene.children.filter(root=>root.visible&&root.userData.renderTileX!==undefined&&[...state.buildings.values()].some(building=>building.tileX===root.userData.renderTileX&&building.tileY===root.userData.renderTileY));const hit=raycaster.intersectObjects(roots,true)[0];if(!hit)return null;let root:THREE.Object3D=hit.object;while(root.parent&&root.parent!==scene)root=root.parent;return [...state.buildings.values()].find(building=>building.tileX===root.userData.renderTileX&&building.tileY===root.userData.renderTileY)??null;},
        pickGround: (clientX,clientY)=>{raycaster.setFromCamera(new THREE.Vector2(clientX/window.innerWidth*2-1,1-clientY/window.innerHeight*2),camera);const point=raycaster.ray.intersectPlane(floor,new THREE.Vector3());return point?{tileX:Math.floor(point.x+256),tileY:Math.floor(point.z+256)}:null;},
        dispose: () => {
            for(const fuse of demoFuses.values())fuse.dispose();
            populationDisplay.dispose();
            orbVictory.dispose();
            tankCloak.dispose();
            environment.dispose();
            researchDisplays.dispose();
            cannon?.dispose();
            deployedPreview.forEach(deployment=>deployment.dispose());
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
        } };
};
