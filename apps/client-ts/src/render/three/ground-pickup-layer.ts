import * as THREE from "three";

// The original world draws pickup icons below tanks. Keep the 3D models and
// ordinary depth testing against buildings; order these two layers before FX.
// Alpha-one pickup materials still shade identically, without blocking a tank.
export const configureGroundPickupLayer = (root: THREE.Object3D): void => {
    const owned = new Map<THREE.Material, THREE.Material>();
    const clone = (source: THREE.Material): THREE.Material => {
        let material = owned.get(source);
        if (!material) {
            material = source.clone();
            material.onBeforeCompile = source.onBeforeCompile;
            material.customProgramCacheKey = source.customProgramCacheKey;
            material.transparent = true; material.depthWrite = false;
            owned.set(source, material);
        }
        return material;
    };
    root.traverse(object => {
        object.renderOrder = -2;
        if (object instanceof THREE.Mesh) object.material = Array.isArray(object.material) ? object.material.map(clone) : clone(object.material);
    });
    root.addEventListener("removed", () => { queueMicrotask(() => { if (root.parent) return; for (const material of owned.values()) material.dispose(); owned.clear(); }); });
};
