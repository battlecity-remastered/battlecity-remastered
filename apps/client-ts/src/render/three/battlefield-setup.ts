import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { FACTORY_PRODUCTS } from "./industrial-demo.js";
import { createOutdoorEnvironment } from "./surface-finish.js";
import { enablePointLightCutoff } from "./point-light-cutoff.js";

export const createBattlefieldRenderer = () => {
    enablePointLightCutoff();
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
    renderer.shadowMap.autoUpdate = false;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.88;
    renderer.info.autoReset = false;
    setDiagnostic("renderer", "three-battlefield");
    const gl = renderer.getContext(), gpuInfo = gl.getExtension("WEBGL_debug_renderer_info");
    setDiagnostic("gpuRenderer", String(gl.getParameter(gpuInfo?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER)));
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
    return { scene, renderer, setDiagnostic, environment, sun };
};

export const loadBattlefieldAssets = async (renderer: THREE.WebGLRenderer) => {
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
    return { tankAsset, centerAsset, groundTexture, industrialAssets, mayorAsset };
};

export const createProductNameplates = () => {
    const nameplates: THREE.Texture[] = [];
    const nameplateFrame = new THREE.BoxGeometry(1.10, 0.31, 0.025);
    const nameplateSteel = new THREE.MeshStandardMaterial({ color: 0x3c4e50, metalness: 0.72, roughness: 0.38 });
    const addProductNameplate = (model: THREE.Object3D, product: string, position = new THREE.Vector3(0, 1.49, -0.86)): void => {
        const canvas = document.createElement("canvas");
        canvas.width = 256; canvas.height = 48;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "#101b1e";
        context.fillRect(0, 0, 256, 48);
        context.strokeStyle = "#7d9293";
        context.lineWidth = 2;
        context.strokeRect(4, 4, 248, 40);
        context.fillStyle = "#c4d4ce";
        context.font = "bold 30px monospace";
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.fillText(product.toUpperCase(), 128, 25);
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.SRGBColorSpace;
        nameplates.push(texture);
        const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.58, metalness: 0.25, emissiveMap: texture, emissive: 0xffffff, emissiveIntensity: 0.12 });
        const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 0.27), material);
        // Tilt the display toward the overhead camera so its lettering remains readable.
        plaque.rotation.set(Math.PI / 3, Math.PI, 0);
        plaque.position.copy(position);
        const frame = new THREE.Mesh(nameplateFrame, nameplateSteel);
        frame.quaternion.copy(plaque.quaternion);
        frame.position.copy(position).addScaledVector(new THREE.Vector3(0, 0, 1).applyQuaternion(plaque.quaternion), -0.014);
        frame.castShadow = frame.receiveShadow = true;
        model.add(frame, plaque);
    };
    return { nameplates, addProductNameplate };
};
