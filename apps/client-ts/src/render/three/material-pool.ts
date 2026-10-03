import * as THREE from "three";

// Pool immutable building finishes only. Animated glow/status uniforms and
// per-tank cloak/team materials continue to have independent ownership.
export const createBuildingMaterialPool = () => {
    const pool = new Map<string, THREE.MeshStandardMaterial>();
    return (root: THREE.Object3D): void => root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || !(object.material instanceof THREE.MeshStandardMaterial)) return;
        const material = object.material;
        if (material.transparent || /glow|core|orb|furnace|reactor|display|lamp/i.test(material.name)) return;
        const { uuid: _uuid, metadata: _metadata, ...properties } = material.toJSON();
        const key = JSON.stringify([properties, material.customProgramCacheKey()]);
        const existing = pool.get(key);
        if (existing) object.material = existing;
        else { pool.set(key, material); material.userData.sharedBuildingFinish = true; }
    });
};
