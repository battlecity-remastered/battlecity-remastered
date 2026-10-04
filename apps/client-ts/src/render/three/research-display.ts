import * as THREE from "three";
import type { ClientState } from "../../app/state.js";
import { fragmentShader1, fragmentShader2 } from "./research-display-shaders.js";
import { createResearchStatus, demoResearchStatus } from "./research-status.js";
import { createResearchEdgeCache } from "./research-edge-cache.js";

// Render the actual item model into the laboratory screen. Two small offscreen
// views share the scene clock, while their glass/scan effects run every frame.
export const createResearchDisplays = (renderer: THREE.WebGLRenderer, environment: THREE.Texture) => {
    const clock = { value: 0 };
    const edgeCache = createResearchEdgeCache();
    const statusClock = createResearchStatus();
    let showroomStart: number | undefined;
    let statusSignature = "[]";
    const displays: Array<{ building: THREE.Object3D; scene: THREE.Scene; camera: THREE.OrthographicCamera; target: THREE.WebGLRenderTarget; turntable: THREE.Group; resources: Array<{ dispose(): void }>; mode: { value: number }; progress: { value: number }; statusCanvas: HTMLCanvasElement; statusTexture: THREE.CanvasTexture; signature: string; demoCycle: boolean; statusMaterials: THREE.MeshStandardMaterial[] }> = [];

    const savedColor = new THREE.Color();
    const displayBounds = new THREE.Sphere(new THREE.Vector3(), 4);
    let lastCapture = -Infinity;

    const isVisible = (display: typeof displays[number], x: number | undefined, z: number | undefined, frustum: THREE.Frustum | undefined): boolean => {
        if (!display.building.parent || !display.building.visible) return false;
        if (x !== undefined && z !== undefined) { const dx = display.building.position.x - x, dz = display.building.position.z - z; if (dx * dx + dz * dz > 35 * 35) return false; }
        displayBounds.center.copy(display.building.position); displayBounds.center.y += 1;
        if (frustum && !frustum.intersectsSphere(displayBounds)) return false;
        return true;
    };
    const updateStatus = (display: typeof displays[number], status: ReturnType<typeof demoResearchStatus>, seconds: number, i: number): void => {
        display.mode.value = status.phase === "ready" ? 2 : status.phase === "researching" ? 1 : 0;
        display.progress.value = status.progress;
        const tint = status.phase === "ready" ? 0x21cba7 : status.phase === "researching" ? 0xe58c2b : 0x244553;
        for (const material of display.statusMaterials) { material.emissive.setHex(tint); material.emissiveIntensity = status.phase === "ready" ? 1.3 : status.phase === "researching" ? 1.1 + Math.sin(seconds * 3.2) * 0.15 : 0.15; }
        display.building.userData.researchPhase = status.phase;
        const remaining = Math.ceil(status.remainingMs / 1000), timer = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, "0")}`;
        const signature = `${status.label}:${remaining}`;
        if (display.signature !== signature) {
            display.signature = signature; const c = display.statusCanvas.getContext("2d")!;
            c.fillStyle = "#061014"; c.fillRect(0, 0, 384, 48); c.textBaseline = "middle"; c.textAlign = "left"; c.font = "bold 26px monospace";
            c.fillStyle = status.phase === "ready" ? "#80edc8" : status.phase === "researching" ? "#ffc071" : "#63808a";
            c.fillText(status.label, 8, 25); if (status.phase === "researching") { c.textAlign = "right"; c.fillText(timer, 376, 25); }
            display.statusTexture.needsUpdate = true;
        }
        display.turntable.rotation.y = seconds * (status.phase === "ready" ? 0.32 : 0.10) + i * 0.9;
    };
    return {
        register: (building: THREE.Object3D, template: THREE.Object3D, product: string, type: number, demoCycle = false): void => {
            const resources: Array<{ dispose(): void }> = [];
            const statusMaterials: THREE.MeshStandardMaterial[] = [];
            const materialCopies = new Map<THREE.Material, THREE.MeshStandardMaterial>();
            building.traverse(child => {
                if (child instanceof THREE.Mesh && !Array.isArray(child.material) && child.material.name === "Research display glow") child.visible = false;
                if (!(child instanceof THREE.Mesh) || Array.isArray(child.material) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
                const name = child.name.replaceAll("_", " ");
                if (child.material.name !== "Research reactor glow" && child.material.name !== "Command glow" && !/Research crystalline specimen|Faceted specimen tip|Static containment field|Research charged core|Scanner charged tip|Probe charged lens/.test(name)) return;
                let material = materialCopies.get(child.material);
                if (!material) { material = child.material.clone(); material.onBeforeCompile = child.material.onBeforeCompile; material.customProgramCacheKey = child.material.customProgramCacheKey; materialCopies.set(child.material, material); statusMaterials.push(material); resources.push(material); }
                child.material = material;
            });
            const scene = new THREE.Scene();
            scene.environment = environment;
            scene.environmentIntensity = 0.7;
            scene.add(new THREE.HemisphereLight(0xb4f5ff, 0x143747, 1.2));
            const light = new THREE.DirectionalLight(0xc6f7ff, 3.0);
            light.position.set(-2, 4, 3);
            scene.add(light);
            const item = template.clone(true);
            const bounds = new THREE.Box3().setFromObject(item);
            const center = bounds.getCenter(new THREE.Vector3());
            item.position.sub(center);
            item.traverse(child => {
                if (!(child instanceof THREE.Mesh)) return;
                child.castShadow = child.receiveShadow = false;
                const source = child.material as THREE.MeshStandardMaterial;
                const hologram = new THREE.MeshStandardMaterial({
                    color: source.color.clone().lerp(new THREE.Color(0x52bcca), 0.32),
                    metalness: 0.45, roughness: 0.34,
                    emissive: source.color.clone().multiplyScalar(0.12).add(new THREE.Color(0x083b48)),
                    emissiveIntensity: 0.65
                });
                resources.push(hologram);
                child.material = hologram;
                // Fine edge light keeps the weapon recognizable against dark glass.
                const edges = new THREE.LineSegments(edgeCache.get(child.geometry), new THREE.LineBasicMaterial({ color: 0x72e8ff, transparent: true, opacity: 0.34 }));
                resources.push(edges.material as THREE.Material);
                child.add(edges);
            });
            const turntable = new THREE.Group();
            turntable.add(item);
            scene.add(turntable);
            const camera = new THREE.OrthographicCamera(-0.48, 0.48, 0.48, -0.48, 0.1, 12);
            camera.position.set(0.6, 2.8, 2.2);
            camera.lookAt(0, 0, 0);
            const target = new THREE.WebGLRenderTarget(192, 192, { type: THREE.HalfFloatType, depthBuffer: true });
            const mode = { value: 0 }, progress = { value: 0 };
            const statusCanvas = document.createElement("canvas");
            statusCanvas.width = 384; statusCanvas.height = 48;
            const statusTexture = new THREE.CanvasTexture(statusCanvas);
            statusTexture.colorSpace = THREE.SRGBColorSpace;
            resources.push(statusTexture);
            displays.push({ building, scene, camera, target, turntable, resources, mode, progress, statusCanvas, statusTexture, signature: "", demoCycle, statusMaterials });

            const label = document.createElement("canvas");
            label.width = 256; label.height = 36;
            const context = label.getContext("2d")!;
            context.fillStyle = "#060f13";
            context.fillRect(0, 0, 256, 36);
            context.fillStyle = "#9ce7ef";
            context.font = "bold 23px monospace";
            context.textBaseline = "middle";
            context.fillText(product.toUpperCase(), 7, 19);
            context.textAlign = "right";
            context.fillStyle = "#50818c";
            context.font = "18px monospace";
            context.fillText(String(type), 248, 19);
            const labelTexture = new THREE.CanvasTexture(label);
            labelTexture.colorSpace = THREE.SRGBColorSpace;
            resources.push(labelTexture);
            const screen = new THREE.ShaderMaterial({
                uniforms: { weaponView: { value: target.texture }, identification: { value: labelTexture }, displayTime: clock, researchMode: mode, researchProgress: progress, statusText: { value: statusTexture } },
                vertexShader: `varying vec2 panelUv; void main(){panelUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragmentShader: fragmentShader1
            });
            const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 0.72), screen);
            panel.rotation.set(-Math.PI / 2, 0, Math.PI);
            panel.position.set(-0.66, 0.835, -1.27);
            resources.push(screen, panel.geometry);
            panel.userData.ownedResearchDisplay = true; building.add(panel);
            // A roof-visible segmented charge ring carries the same status at map scale.
            const haloMaterial = new THREE.ShaderMaterial({
                transparent: true, depthWrite: false,
                uniforms: { displayTime: clock, researchMode: mode, researchProgress: progress },
                vertexShader: `varying vec2 haloUv;void main(){haloUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                fragmentShader: fragmentShader2
            });
            const halo = new THREE.Mesh(new THREE.PlaneGeometry(1.86, 1.86), haloMaterial);
            halo.rotation.x = -Math.PI / 2; halo.position.set(-0.49, 1.635, 0.18); halo.layers.set(1);
            halo.userData.ownedResearchDisplay = true; building.add(halo); resources.push(halo.geometry, haloMaterial);
        },
        unregister: (root: THREE.Object3D): void => { for (let index = displays.length - 1; index >= 0; index--)if (root.getObjectById(displays[index]!.building.id)) { displays[index]!.target.dispose(); displays[index]!.resources.forEach(resource => resource.dispose()); displays.splice(index, 1); } const panels: THREE.Object3D[] = []; root.traverse(part => { if (part.userData.ownedResearchDisplay) panels.push(part); }); for (const panel of panels) panel.removeFromParent(); },
        update: (state: ClientState, seconds: number, x?: number, z?: number, frustum?: THREE.Frustum): void => {
            clock.value = seconds;
            if (seconds - lastCapture < 0.10 || displays.length === 0) return;
            lastCapture = seconds;
            showroomStart ??= seconds;
            const now = Date.now(); statusClock.sync(state, now);
            const buildings = new Map<string, ClientState["buildings"] extends Map<string, infer B> ? B : never>();
            for (const building of state.buildings.values()) if (building.type >= 400) buildings.set(`${building.tileX},${building.tileY}`, building);
            const previousTarget = renderer.getRenderTarget();
            const previousAlpha = renderer.getClearAlpha();
            renderer.getClearColor(savedColor);
            renderer.setClearColor(0x000000, 0);
            for (let i = 0; i < displays.length; i++) {
                const display = displays[i]!;
                if (!isVisible(display, x, z, frustum)) continue;
                const building = buildings.get(`${display.building.userData.renderTileX},${display.building.userData.renderTileY}`);
                const status: ReturnType<typeof demoResearchStatus> = display.demoCycle ? demoResearchStatus(seconds - showroomStart) : building ? statusClock.resolve(state, building, now) : { phase: "waiting", progress: 0, remainingMs: 0, label: "LINK OFFLINE" };
                updateStatus(display, status, seconds, i);
                renderer.setRenderTarget(display.target);
                renderer.render(display.scene, display.camera);
            }
            statusSignature = JSON.stringify(displays.map(display => [display.building.userData.renderTileX, display.building.userData.renderTileY, display.building.userData.researchPhase]));
            renderer.setRenderTarget(previousTarget);
            renderer.setClearColor(savedColor, previousAlpha);
        },
        async prepare(templates: Iterable<THREE.Object3D> = []): Promise<void> {
            edgeCache.prepare(templates);
            for (const display of displays) {
                const previous = renderer.getRenderTarget();
                try { renderer.setRenderTarget(display.target); await renderer.compileAsync(display.scene, display.camera); renderer.render(display.scene, display.camera); }
                finally { renderer.setRenderTarget(previous); }
            }
        },
        get statusSignature(): string { return statusSignature; },
        dispose: (): void => {
            for (const display of displays) {
                display.target.dispose();
                display.resources.forEach(resource => resource.dispose());
            }
            displays.length = 0;
            edgeCache.dispose();
        }
    };
};
