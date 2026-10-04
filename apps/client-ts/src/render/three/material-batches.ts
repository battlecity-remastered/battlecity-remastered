import * as THREE from "three";
import { mergeStaticBuildingGeometry, preserveBuildingLocalShading } from "./static-building-geometry.js";

type Batch = { sources: THREE.Mesh[]; mesh?: THREE.Mesh; previous?: Float64Array; ids?: number[] };
const capacity = (count: number): number => 2 ** Math.ceil(Math.log2(Math.max(1, count)));
const matrixChanged = (previous: Float64Array, offset: number, elements: number[]): boolean => {
    for (let element = 0; element < 16; element++) if (previous[offset + element] !== elements[element]) return true;
    return false;
};

const createMesh = (batch: Batch, materialFor: (source: THREE.Material, kind: string) => THREE.Material): NonNullable<Batch["mesh"]> => {
    const first = batch.sources[0]!;
    const geometries = new Set(batch.sources.map(source => source.geometry));
    if (geometries.size === 1) {
        const mesh = new THREE.InstancedMesh(first.geometry, materialFor(first.material as THREE.Material, "instanced"), capacity(batch.sources.length));
        mesh.count = batch.sources.length; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        return mesh;
    }
    if (batch.sources.every(source => !source.matrixAutoUpdate)) {
        // update() builds this once from final matrices/visibility below. A
        // provisional merge here would immediately be discarded and rebuilt.
        return new THREE.Mesh(new THREE.BufferGeometry(), materialFor(first.material as THREE.Material, "merged"));
    }
    let vertices = 0, indices = 0;
    for (const geometry of geometries) { vertices += geometry.attributes.position!.count; indices += geometry.index?.count ?? 0; }
    const mesh = new THREE.BatchedMesh(capacity(batch.sources.length), capacity(vertices), capacity(indices), materialFor(first.material as THREE.Material, "batched"));
    const geometryIds = new Map<THREE.BufferGeometry, number>();
    for (const geometry of geometries) geometryIds.set(geometry, mesh.addGeometry(geometry));
    batch.ids = batch.sources.map(source => mesh.addInstance(geometryIds.get(source.geometry)!));
    // Per-object culling avoids drawing every object in a partially visible cell.
    mesh.perObjectFrustumCulled = true; mesh.sortObjects = false;
    return mesh;
};

const releaseMesh = (mesh?: THREE.Mesh): void => {
    mesh?.removeFromParent();
    if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.BatchedMesh) mesh.dispose();
    else mesh?.geometry.dispose();
};

const uploadTransform = (mesh: THREE.Mesh, id: number, matrix: THREE.Matrix4, visible: boolean): void => {
    if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.BatchedMesh) mesh.setMatrixAt(id, matrix);
    if (mesh instanceof THREE.BatchedMesh) mesh.setVisibleAt(id, visible);
};

const refreshBounds = (mesh: THREE.Mesh, sources: THREE.Mesh[], previous: Float64Array): void => {
    if (mesh instanceof THREE.InstancedMesh) mesh.instanceMatrix.needsUpdate = true;
    if (mesh instanceof THREE.InstancedMesh || mesh instanceof THREE.BatchedMesh) mesh.computeBoundingSphere();
    else { mesh.geometry.dispose(); mesh.geometry = mergeStaticBuildingGeometry(sources, previous); }
};

// Spatial hybrid batches: identical geometry uses instancing, static mixed
// geometry retains local shader coordinates in an attribute, and articulated
// mixed geometry uses native multi-draw with per-object frustum culling.
export const createMaterialBatches = (scene: THREE.Scene, initialRoots: ReadonlyArray<THREE.Object3D>, multiDraw = true) => {
    const roots = new Set<THREE.Object3D>(), groups = new Map<string, Batch>();
    const pending = new Set<Batch>();
    const variants = new Map<string, THREE.Material>();
    const materialFor = (source: THREE.Material, kind: string): THREE.Material => {
        if (!source.userData.sharedBuildingFinish && kind !== "merged") return source;
        const key = `${source.uuid}/${kind}`;
        let material = variants.get(key);
        if (!material) {
            material = source.clone(); material.onBeforeCompile = source.onBeforeCompile; material.customProgramCacheKey = source.customProgramCacheKey;
            if (kind === "merged") preserveBuildingLocalShading(material, source);
            variants.set(key, material);
        }
        return material;
    };
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const resize = (batch: Batch): void => {
        pending.delete(batch);
        releaseMesh(batch.mesh);
        delete batch.mesh; delete batch.previous; delete batch.ids;
        if (batch.sources.length < 2) { for (const source of batch.sources) source.visible = true; return; }
        const first = batch.sources[0]!, mesh = createMesh(batch, materialFor);
        mesh.name = "Spatial building batch"; mesh.castShadow = first.castShadow; mesh.receiveShadow = first.receiveShadow;
        mesh.layers.mask = first.layers.mask; mesh.renderOrder = first.renderOrder;
        mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
        scene.add(mesh); batch.mesh = mesh;
        batch.previous = new Float64Array(batch.sources.length * 16).fill(NaN);
        for (const source of batch.sources) source.visible = false;
    };
    const register = (root: THREE.Object3D, deferResize = false): void => {
        if (roots.has(root)) return;
        roots.add(root);
        const cell = `${Math.floor((root.userData.renderTileX ?? root.position.x + 256) / 8)},${Math.floor((root.userData.renderTileY ?? root.position.z + 256) / 8)}`;
        const changed = new Set<Batch>();
        root.traverse(object => {
            if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh || object instanceof THREE.InstancedMesh || object instanceof THREE.BatchedMesh || !object.visible || Array.isArray(object.material) || object.material.transparent || object.morphTargetInfluences?.length) return;
            const layout = Object.keys(object.geometry.attributes).map(name => { const attribute = object.geometry.attributes[name]!; return `${name}:${attribute.itemSize}:${attribute.normalized}`; }).sort().join("/");
            const key = `${cell}/${object.material.uuid}/${object.castShadow}/${object.receiveShadow}/${object.layers.mask}/${object.renderOrder}/${Boolean(object.geometry.index)}/${layout}${multiDraw ? "" : `/${object.geometry.uuid}`}`;
            let batch = groups.get(key);
            if (!batch) { batch = { sources: [] }; groups.set(key, batch); }
            batch.sources.push(object); changed.add(batch);
        });
        for (const batch of changed) { if (deferResize) pending.add(batch); else resize(batch); }
    };
    const unregister = (root: THREE.Object3D): void => {
        if (!roots.delete(root)) return;
        const descendants = new Set<THREE.Object3D>(); root.traverse(object => descendants.add(object));
        for (const [key, batch] of groups) {
            if (!batch.sources.some(source => descendants.has(source))) continue;
            for (const source of batch.sources) if (descendants.has(source)) source.visible = true;
            batch.sources = batch.sources.filter(source => !descendants.has(source)); resize(batch);
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
        for (const batch of pending) resize(batch);
        for (const batch of groups.values()) {
            const { mesh, previous } = batch; if (!mesh || !previous) continue;
            let changed = false;
            for (let index = 0; index < batch.sources.length; index++) {
                const source = batch.sources[index]!, visible = isVisible(source), matrix = visible ? source.matrixWorld : hidden;
                const offset = index * 16, elements = matrix.elements;
                if (!matrixChanged(previous, offset, elements)) continue;
                previous.set(elements, offset);
                const id = batch.ids?.[index] ?? index;
                uploadTransform(mesh, id, matrix, visible);
                changed = true;
            }
            if (changed) refreshBounds(mesh, batch.sources, previous);
        }
    };
    for (const root of initialRoots) register(root, true);
    update();
    return { register, unregister, update, get count(): number { return [...groups.values()].filter(batch => batch.mesh).length; }, dispose(): void {
        for (const batch of groups.values()) { releaseMesh(batch.mesh); for (const source of batch.sources) source.visible = true; }
        groups.clear(); roots.clear(); pending.clear();
        for (const material of variants.values()) material.dispose(); variants.clear();
    } };
};
