import * as THREE from "three";

// Item template vertex buffers are immutable; each display animates Object3D
// transforms only. Keep the exact native 32-degree edges, owned by the display
// manager so deleting one laboratory cannot dispose another's shared geometry.
export const createResearchEdgeCache = () => {
    const cache = new Map<THREE.BufferGeometry, THREE.EdgesGeometry>();
    const get = (source: THREE.BufferGeometry): THREE.EdgesGeometry => {
        let edges = cache.get(source);
        if (!edges) { edges = new THREE.EdgesGeometry(source, 32); cache.set(source, edges); }
        return edges;
    };
    return {
        get,
        prepare(templates: Iterable<THREE.Object3D>): void {
            for (const template of templates) template.traverse(object => { if (object instanceof THREE.Mesh) get(object.geometry); });
        },
        dispose(): void { for (const geometry of cache.values()) geometry.dispose(); cache.clear(); }
    };
};
