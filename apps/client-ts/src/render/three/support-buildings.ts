import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

const templates = new Map<number, THREE.Group>();
export const setSupportBuildingTemplate=(type:number,model:THREE.Object3D):void=>{const root=new THREE.Group();root.name=type===300?"Residential habitat":"Field hospital";root.add(model);templates.set(type,root);};
export const createSupportBuilding = (type: number): THREE.Group => {
    const cached = templates.get(type);
    if (cached) return cached.clone(true);
    const hospital = type === 200, root = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0x839697, metalness: 0.82, roughness: 0.32 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x18282d, metalness: 0.64, roughness: 0.5 });
    const concrete = new THREE.MeshStandardMaterial({ color: 0x5d635e, metalness: 0.15, roughness: 0.85 });
    const glass = new THREE.MeshStandardMaterial({ color: 0x143d48, metalness: 0.45, roughness: 0.19, emissive: 0x087a9b, emissiveIntensity: 0.55 });
    const glow = new THREE.MeshStandardMaterial({ color: hospital ? 0xcafce7 : 0x9ad8df, emissive: hospital ? 0x45db97 : 0x2baaca, emissiveIntensity: 1.5, roughness: 0.25 });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
        const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); root.add(mesh); return mesh;
    };
    const box = (w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => add(new THREE.BoxGeometry(w, h, d), material, x, y, z);
    box(2.9, 0.12, 2.9, concrete, 0, 0.06, hospital ? 0.5 : 0);
    box(2.72, 0.13, hospital ? 1.84 : 2.7, steel, 0, 0.18, 0);
    if (hospital) {
        box(2.48, 0.78, 1.64, armor, 0, 0.60, 0);
        const dome = add(new THREE.SphereGeometry(1, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), steel, 0, 0.94, 0);
        dome.scale.set(1.16, 0.85, 0.77);
        const ring = add(new THREE.TorusGeometry(1.02, 0.055, 8, 48), glow, 0, 0.96, 0); ring.rotation.x = Math.PI / 2; ring.scale.y = 0.7;
        for (const side of [-1, 1]) {
            box(0.34, 0.62, 0.26, steel, side * 1.19, 0.71, 0.48);
            box(0.25, 0.05, 0.035, glow, side * 1.19, 0.78, 0.63);
            box(0.055, 0.24, 0.035, glow, side * 1.19, 0.78, 0.63);
        }
        box(0.72, 0.61, 0.09, steel, 0, 0.60, 0.87);
        box(0.57, 0.5, 0.1, glass, 0, 0.60, 0.92);
        box(0.78, 0.05, 0.07, glow, 0, 0.95, 0.94);
        for (let step = 0; step < 3; step++) box(0.91, 0.06, 0.24, steel, 0, 0.15 - step * 0.025, 1.02 + step * 0.23);
    } else {
        for (const side of [-1, 1]) {
            box(0.94, 1.27, 2.33, armor, side * 0.73, 0.90, 0);
            box(1.02, 0.15, 2.41, steel, side * 0.73, 1.59, 0);
            for (let row = 0; row < 3; row++) for (let window = 0; window < 5; window++) {
                box(0.015, 0.17, 0.27, glass, side * 1.208, 0.47 + row * 0.36, -0.82 + window * 0.41);
            }
            for (let rib = 0; rib < 4; rib++) box(0.08, 1.35, 0.07, steel, side * 1.21, 0.93, -1.05 + rib * 0.7);
            box(0.60, 0.27, 0.38, steel, side * 0.73, 1.79, -0.65);
            box(0.49, 0.05, 0.27, armor, side * 0.73, 1.95, -0.65);
        }
        box(0.42, 0.63, 0.4, steel, 0, 0.57, 0.9);
        box(0.32, 0.48, 0.06, glass, 0, 0.57, 1.12);
        for (let lamp = 0; lamp < 4; lamp++) box(0.04, 0.04, 0.23, glow, 0, 0.14, -0.65 + lamp * 0.48);
    }
    // Merge static pieces by material so every apartment window is not a draw.
    root.updateWorldMatrix(true, true);
    const groups = new Map<THREE.Material, THREE.BufferGeometry[]>();
    root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
        const geometry = object.geometry.index ? object.geometry.toNonIndexed() : object.geometry.clone();
        geometry.applyMatrix4(object.matrixWorld);
        const group = groups.get(object.material) ?? []; group.push(geometry); groups.set(object.material, group);
        object.geometry.dispose();
    });
    root.clear();
    for (const [material, geometries] of groups) {
        const geometry = mergeGeometries(geometries)!;
        geometries.forEach(part => part.dispose());
        const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh);
    }
    root.name = hospital ? "Field hospital" : "Residential habitat";
    templates.set(type, root);
    return root.clone(true);
};
