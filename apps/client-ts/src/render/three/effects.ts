import * as THREE from "three";
import type { LoadedMap } from "../../world/map-loader.js";
import { fragmentShader1, fragmentShader2, fragmentShader3, fragmentShader4, materialPatch1, materialPatch2, materialPatch3, materialPatch4, materialPatch5, materialPatch6, vertexShader1, vertexShader2, vertexShader3, vertexShader4 } from "./effects-shaders.js";

// Share the clock/materials across city instances. Animation never affects
// the building footprint, apron, collision, or gameplay camera.
export const createBuildingEffects = (template: THREE.Object3D, clips: THREE.AnimationClip[]) => {
    const time = { value: 0 };
    const replacements = new Map<THREE.Material, THREE.Material>();
    const mixers: THREE.AnimationMixer[] = [];
    template.traverse(child => {
        if (!(child instanceof THREE.Mesh) || !(child.material instanceof THREE.MeshStandardMaterial)) return;
        const original = child.material;
        const kind = original.name === "Command glow" ? "ring"
            : original.name === "Entrance energy core" ? "core"
                : original.name === "Factory furnace glow" ? "furnace"
                    : original.name === "Research display glow" ? "display"
                        : original.name === "Research reactor glow" ? "reactor"
                            : original.name === "Orb plasma shell" ? "orb"
                                : /Orb.*glow/.test(original.name) ? "orb-ring" : null;
        if (!kind) return;
        let material = replacements.get(original);
        if (!material) {
            const animated = original.clone();
            animated.onBeforeCompile = shader => {
                shader.uniforms.machineTime = time;
                shader.vertexShader = shader.vertexShader.replace("#include <common>",
                    "#include <common>\nvarying vec2 machineUv; varying vec3 machinePosition;");
                shader.vertexShader = shader.vertexShader.replace("#include <uv_vertex>",
                    "#include <uv_vertex>\nmachineUv = uv;");
                shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>",
                    "#include <begin_vertex>\nmachinePosition = transformed;");
                shader.fragmentShader = shader.fragmentShader.replace("#include <common>",
                    "#include <common>\nvarying vec2 machineUv; varying vec3 machinePosition;\nuniform float machineTime;");
                shader.fragmentShader = shader.fragmentShader.replace("#include <emissivemap_fragment>",
                    kind === "ring" ? materialPatch1 : kind === "orb" ? materialPatch2 : kind === "display" ? materialPatch3 : kind === "furnace" ? materialPatch4 : kind === "reactor" || kind === "orb-ring" ? materialPatch5 : materialPatch6);
            };
            animated.customProgramCacheKey = () => `dx-machine-${kind}-v2`;
            replacements.set(original, animated);
            material = animated;
        }
        child.material = material;
    });
    return {
        register: (center: THREE.Object3D): void => {
            if (!clips.length) return;
            const mixer = new THREE.AnimationMixer(center);
            for (const clip of clips) mixer.clipAction(clip).play();
            mixer.update(mixers.length * 0.31);
            mixers.push(mixer);
        },
        unregister: (root: THREE.Object3D): void => {
            for (let index = mixers.length - 1; index >= 0; index--) { const mixer = mixers[index]!; const animatedRoot = mixer.getRoot(); if (animatedRoot instanceof THREE.Object3D && root.getObjectById(animatedRoot.id)) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); mixers.splice(index, 1); } }
        },
        update: (seconds: number, dt: number): void => {
            time.value = seconds;
            for (const mixer of mixers) mixer.update(dt);
        },
        dispose: (): void => {
            for (const mixer of mixers) { mixer.stopAllAction(); mixer.uncacheRoot(mixer.getRoot()); }
        }
    };
};

const CENTER = 256;
const PARTICLE_COUNT = 180;

export const createIndustrialEffects = () => {
    const clock = { value: 0 };
    const ratio = Math.min(window.devicePixelRatio, 1.75);
    const orbs: Array<{ object: THREE.Object3D; baseY: number; light: THREE.PointLight }> = [];

    const addArc = (root: THREE.Object3D, start: THREE.Vector3, end: THREE.Vector3, violet: boolean): void => {
        const positions: number[] = [], phases: number[] = [];
        for (let i = 0; i <= 32; i++) {
            const t = i / 32, point = start.clone().lerp(end, t);
            point.y += Math.sin(t * Math.PI) * 0.09;
            positions.push(point.x, point.y, point.z);
            phases.push(t);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("arcProgress", new THREE.Float32BufferAttribute(phases, 1));
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
            uniforms: { energyTime: clock, energyColor: { value: new THREE.Vector3(...(violet ? [0.75, 0.22, 2.4] : [0.12, 0.9, 2.1]) as [number, number, number]) } },
            vertexShader: vertexShader1,
            fragmentShader: fragmentShader1
        });
        const arc = new THREE.Line(geometry, material);
        arc.frustumCulled = false;
        arc.userData.ownedEffect = true; root.add(arc);
    };

    const addSteam = (root: THREE.Object3D): void => {
        const positions: number[] = [], seeds: number[] = [];
        for (const side of [-1, 1]) for (let i = 0; i < 12; i++) {
            positions.push(side * 1.05, 2.24, 0.42);
            seeds.push((i * 0.61803398875 + (side + 1) * 0.27) % 1);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute("steamSeed", new THREE.Float32BufferAttribute(seeds, 1));
        const material = new THREE.ShaderMaterial({
            transparent: true, depthWrite: false,
            uniforms: { energyTime: clock, particleRatio: { value: ratio } },
            vertexShader: vertexShader2,
            fragmentShader: fragmentShader2
        });
        const steam = new THREE.Points(geometry, material);
        steam.frustumCulled = false;
        steam.userData.ownedEffect = true; root.add(steam);
    };

    return {
        unregister: (root: THREE.Object3D): void => {
            for (let index = orbs.length - 1; index >= 0; index--)if (root.getObjectById(orbs[index]!.object.id)) orbs.splice(index, 1);
            const owned: THREE.Object3D[] = []; root.traverse(object => { if (object.userData.ownedEffect && (object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line)) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()); owned.push(object); } }); for (const object of owned) object.removeFromParent();
        },
        registerBuilding: (root: THREE.Object3D, kind: "factory" | "research" | "orb-factory"): void => {
            if (kind === "factory") addSteam(root);
            if (kind === "research") {
                addArc(root, new THREE.Vector3(-0.49, 1.85, 0.18), new THREE.Vector3(0.75, 1.8, 0.32), false);
                for (const side of [-1, 1]) addArc(root, new THREE.Vector3(-0.49 + side * 0.38, 1.97, 0.18 + side * 0.38), new THREE.Vector3(-0.49, 1.89, 0.18), false);
            }
            if (kind === "orb-factory") {
                for (const side of [-1, 1]) addArc(root, new THREE.Vector3(side * 0.99, 2.28, 0.42), new THREE.Vector3(0, 2.08, -0.05), true);
                const light = new THREE.PointLight(0x8565ff, 0.7, 2.7, 2);
                light.position.set(0, 2.0, -0.05);
                root.add(light);
            }
        },
        registerOrb: (root: THREE.Object3D): void => {
            const light = new THREE.PointLight(0x8866ff, 1.0, 2.3, 2);
            light.position.set(0, 0.35, 0);
            root.add(light);
            orbs.push({ object: root, baseY: root.position.y, light });
            const seeds = Array.from({ length: 36 }, (_, i) => (i * 0.61803398875) % 1);
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(seeds.length * 3), 3));
            geometry.setAttribute("moteSeed", new THREE.Float32BufferAttribute(seeds, 1));
            const material = new THREE.ShaderMaterial({
                transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
                uniforms: { energyTime: clock, particleRatio: { value: ratio } },
                vertexShader: vertexShader3,
                fragmentShader: fragmentShader3
            });
            const motes = new THREE.Points(geometry, material);
            motes.frustumCulled = false;
            motes.userData.ownedEffect = true; root.add(motes);
        },
        update: (seconds: number): void => {
            clock.value = seconds;
            const orbIntensity = orbs.length ? 0.7 + Math.pow(0.5 + 0.5 * Math.sin(seconds * 2.4), 6) * 1.2 : 0;
            for (const [i, orb] of orbs.entries()) {
                orb.object.position.y = orb.baseY + Math.sin(seconds * 2.1 + i) * 0.045;
                orb.light.intensity = orbIntensity;
            }
        }
    };
};

export const createLavaEffects = (data: LoadedMap, scene: THREE.Scene) => {
    // Index lava by chunk once; only a few nearby buckets are examined when
    // the player crosses a four-tile boundary or resizes the viewport.
    const buckets = new Map<string, Array<[number, number]>>();
    for (let x = 0; x < data.map.length; x++) for (let z = 0; z < data.map.length; z++) {
        if (data.map[x]?.[z] !== 1) continue;
        const key = `${Math.floor(x / 32)},${Math.floor(z / 32)}`;
        let cells = buckets.get(key);
        if (!cells) { cells = []; buckets.set(key, cells); }
        cells.push([x, z]);
    }
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT);
    for (let i = 0; i < seeds.length; i++) seeds[i] = (i * 0.61803398875) % 1;
    const geometry = new THREE.BufferGeometry();
    const positionAttribute = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
    geometry.setAttribute("position", positionAttribute);
    geometry.setAttribute("emberSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.setDrawRange(0, 0);
    const clock = { value: 0 };
    const material = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { emberTime: clock, emberPixelRatio: { value: Math.min(window.devicePixelRatio, 1.75) } },
        vertexShader: vertexShader4,
        fragmentShader: fragmentShader4
    });
    const embers = new THREE.Points(geometry, material);
    embers.frustumCulled = false;
    scene.add(embers);
    const lights = Array.from({ length: 4 }, () => {
        const light = new THREE.PointLight(0xff4a08, 0, 3.6, 2);
        scene.add(light);
        return light;
    });
    let lastRegion = "";
    return {
        update: (seconds: number, playerX: number, playerZ: number, width: number, height: number): void => {
            clock.value = seconds;
            const tileX = playerX + CENTER, tileZ = playerZ + CENTER;
            const key = `${Math.floor(tileX / 4)},${Math.floor(tileZ / 4)},${width},${height}`;
            if (key !== lastRegion) {
                lastRegion = key;
                const halfWidth = width / 48 / 2 + 5, halfHeight = height / 48 / 2 + 3;
                const cells: Array<[number, number]> = [];
                for (let bx = Math.floor((tileX - halfWidth) / 32); bx <= Math.floor((tileX + halfWidth) / 32); bx++) {
                    for (let bz = Math.floor((tileZ - halfHeight) / 32); bz <= Math.floor((tileZ + halfHeight) / 32); bz++) {
                        for (const cell of buckets.get(`${bx},${bz}`) ?? []) {
                            if (Math.abs(cell[0] - tileX) < halfWidth && Math.abs(cell[1] - tileZ) < halfHeight) cells.push(cell);
                        }
                    }
                }
                let count = 0;
                for (const [x, z] of cells) {
                    const hash = Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 1;
                    if (hash > Math.min(0.34, PARTICLE_COUNT / Math.max(cells.length, 1))) continue;
                    positions[count * 3] = x - CENTER + 0.2 + hash;
                    positions[count * 3 + 1] = -0.025;
                    positions[count * 3 + 2] = z - CENTER + 0.25 + hash * 0.8;
                    if (++count >= PARTICLE_COUNT) break;
                }
                geometry.setDrawRange(0, count);
                positionAttribute.needsUpdate = true;
                cells.sort((a, b) => Math.hypot(a[0] - tileX, a[1] - tileZ) - Math.hypot(b[0] - tileX, b[1] - tileZ));
                const selected: Array<[number, number]> = [];
                for (const cell of cells) {
                    if (selected.every(previous => Math.hypot(previous[0] - cell[0], previous[1] - cell[1]) > 3.5)) selected.push(cell);
                    if (selected.length === lights.length) break;
                }
                lights.forEach((light, i) => {
                    const cell = selected[i];
                    light.visible = !!cell;
                    if (cell) light.position.set(cell[0] - CENTER + 0.5, 0.25, cell[1] - CENTER + 0.5);
                });
            }
            lights.forEach((light, i) => { light.intensity = 0.38 + Math.sin(seconds * 2.1 + i * 1.7) * 0.08; });
        }
    };
};
