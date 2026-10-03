import * as THREE from "three";
import type { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
export const prepareScreenScene = async (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): Promise<void> => {
    const target = renderer.getRenderTarget();
    try { renderer.setRenderTarget(null); await renderer.compileAsync(scene, camera); }
    finally { renderer.setRenderTarget(target); }
};

// Compile the actual AO variants (ordinary, instanced and batched), then render
// the complete pipeline behind the loading screen. This also allocates shadow,
// MSAA, bloom and output targets instead of discovering them while playing.
export const prepareRenderPasses = async (
    renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera,
    normalMaterial: THREE.MeshNormalMaterial, composer: EffectComposer
): Promise<void> => {
    const previous = renderer.getRenderTarget(), materials = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    try {
        scene.traverse(object => { if (object instanceof THREE.Mesh) { materials.set(object, object.material); object.material = normalMaterial; } });
        renderer.setRenderTarget(target);
        await renderer.compileAsync(scene, camera);
    } finally {
        for (const [object, material] of materials) object.material = material;
        renderer.setRenderTarget(previous); target.dispose();
    }
    renderer.shadowMap.needsUpdate = true;
    composer.render();
};
