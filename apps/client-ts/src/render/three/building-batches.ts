import * as THREE from "three";

type Batch = { sources: THREE.Mesh[]; mesh?: THREE.InstancedMesh; previous?: Float64Array };

// Identical building parts share draws. Keep every articulated source transform,
// but upload instance buffers only when animation, placement or visibility changes.
export const createBuildingBatches = (scene: THREE.Scene, initialRoots: ReadonlyArray<THREE.Object3D>) => {
    const roots = new Set<THREE.Object3D>();
    const groups = new Map<string, Batch>();
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const resizeBatch = (batch: Batch): void => {
        if (batch.sources.length < 2) {
            if (batch.mesh) { batch.mesh.removeFromParent(); batch.mesh.dispose(); delete batch.mesh; delete batch.previous; }
            for (const source of batch.sources) source.visible = true;
            return;
        }
        if (!batch.mesh || batch.mesh.instanceMatrix.count < batch.sources.length) {
            batch.mesh?.removeFromParent(); batch.mesh?.dispose();
            const first = batch.sources[0]!;
            const capacity = 2 ** Math.ceil(Math.log2(batch.sources.length));
            const mesh = new THREE.InstancedMesh(first.geometry, first.material, capacity);
            mesh.name = "Repeated factory parts"; mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
            mesh.layers.mask = first.layers.mask; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
            mesh.count = batch.sources.length; mesh.updateMatrix(); mesh.matrixAutoUpdate = false; scene.add(mesh); batch.mesh = mesh;
        }
        batch.mesh.count = batch.sources.length;
        batch.previous = new Float64Array(batch.mesh.instanceMatrix.count * 16).fill(NaN);
        for (const source of batch.sources) source.visible = false;
    };
    const register = (root: THREE.Object3D): void => {
        if (roots.has(root)) return;
        roots.add(root);
        const cellX = Math.floor((root.userData.renderTileX ?? root.position.x + 256) / 8);
        const cellZ = Math.floor((root.userData.renderTileY ?? root.position.z + 256) / 8);
        const changed = new Set<Batch>();
        root.traverse(object => {
            if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || !object.visible || Array.isArray(object.material) || object.material.transparent || object.morphTargetInfluences?.length) return;
            const key = `${cellX},${cellZ}/${object.geometry.uuid}/${object.material.uuid}/${object.castShadow}/${object.receiveShadow}/${object.layers.mask}`;
            let batch = groups.get(key);
            if (!batch) { batch = { sources: [] }; groups.set(key, batch); }
            batch.sources.push(object); changed.add(batch);
        });
        for (const batch of changed) resizeBatch(batch);
    };
    const unregister = (root: THREE.Object3D): void => {
        if (!roots.delete(root)) return;
        const descendants = new Set<THREE.Object3D>(); root.traverse(object => descendants.add(object));
        for (const [key, batch] of groups) {
            const removed = batch.sources.filter(source => descendants.has(source));
            if (!removed.length) continue;
            for (const source of removed) source.visible = true;
            batch.sources = batch.sources.filter(source => !descendants.has(source));
            resizeBatch(batch);
            if (!batch.sources.length) groups.delete(key);
        }
    };
    const isVisible = (source: THREE.Mesh): boolean => {
        let parent = source.parent;
        while (parent && parent !== scene && parent.visible) parent = parent.parent;
        return parent === scene && scene.visible;
    };
    const update = (worldMatricesReady = false): void => {
        if (!worldMatricesReady) for (const root of roots) root.updateWorldMatrix(true, true);
        for (const batch of groups.values()) {
            const { mesh, previous } = batch;
            if (!mesh || !previous) continue;
            let changed = false;
            for (let index = 0; index < batch.sources.length; index++) {
                const source = batch.sources[index]!;
                const visible = isVisible(source);
                const matrix = visible ? source.matrixWorld : hidden;
                const offset = index * 16, elements = matrix.elements;
                let differs = false;
                for (let element = 0; element < 16; element++) {
                    if (previous[offset + element] !== elements[element]) { differs = true; break; }
                }
                if (!differs) continue;
                previous.set(elements, offset); mesh.setMatrixAt(index, matrix); changed = true;
            }
            if (changed) { mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere(); }
        }
    };
    for (const root of initialRoots) register(root);
    update();
    return {
        register, unregister, update, get count(): number { return [...groups.values()].filter(batch => batch.mesh).length; }, dispose(): void {
            for (const batch of groups.values()) { batch.mesh?.removeFromParent(); batch.mesh?.dispose(); for (const source of batch.sources) source.visible = true; }
            groups.clear(); roots.clear();
        }
    };
};
