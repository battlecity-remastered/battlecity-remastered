import * as THREE from "three";

// Terrain transforms are immutable; only GPU uniforms animate. Preserve normal
// Object3D semantics for an explicit forced/dirty parent transform update.
class StaticTerrainChunk extends THREE.Group {
    override updateMatrixWorld(force = false): void {
        if (force || this.matrixWorldNeedsUpdate) super.updateMatrixWorld(force);
    }
}

export const createTerrainChunks = (scene: THREE.Scene) => {
    const chunks: Array<{ root: StaticTerrainChunk; bounds: THREE.Box3 }> = [];
    return {
        add(x: number, z: number, size: number): THREE.Group {
            const root = new StaticTerrainChunk(); root.name = "Static terrain chunk";
            root.matrixAutoUpdate = false; root.updateMatrix(); scene.add(root);
            const bounds = new THREE.Box3(new THREE.Vector3(x - 256, -2, z - 256), new THREE.Vector3(x - 256 + size, 2, z - 256 + size));
            chunks.push({ root, bounds }); return root;
        },
        prepare(): void { for (const chunk of chunks) chunk.root.updateMatrixWorld(true); },
        updateVisibility(camera: THREE.Frustum, shadow: THREE.Frustum): void {
            // Offscreen rocks can still cast into the visible scene. A chunk is
            // omitted only when it misses both the camera and the sun's volume.
            for (const chunk of chunks) chunk.root.visible = camera.intersectsBox(chunk.bounds) || shadow.intersectsBox(chunk.bounds);
        }
    };
};
