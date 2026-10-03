import * as THREE from "three";
import { createShaderWarmupScene } from "./shader-warmup-scene.js";

// Changing Three's point-light count recompiles every lit material. Keep the
// previous count rendering while KHR_parallel_shader_compile prepares the new
// variant. Only the newly arrived glow waits; simulation and camera continue.
export const createLightVariantWarmup = (renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, normal: THREE.MeshNormalMaterial) => {
    const frustum = new THREE.Frustum(), viewProjection = new THREE.Matrix4(), influence = new THREE.Sphere();
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const padding: THREE.PointLight[] = [], hidden: THREE.PointLight[] = [], lights: THREE.PointLight[] = [], reservePool: THREE.PointLight[] = [];
    const owned = new Set<THREE.Material>();
    const empty = new THREE.Group();
    const reserved = new THREE.Group(), reserveLights = new Set<THREE.PointLight>(); scene.add(reserved);
    let committed = -1, prepared = -1, pending = false, disposed = false;
    const reset = (): void => {
        for (const light of hidden) light.visible = true;
        hidden.length = 0;
        for (const light of padding) light.removeFromParent();
    };
    const compile = (count: number): void => {
        pending = true;
        // compileAsync polls material.currentProgram. Separate material copies
        // prevent the continuing old-light render from replacing that pointer.
        const { warm, shadows, shadowScene } = createShaderWarmupScene(scene, normal, owned);
        const previous = renderer.getRenderTarget();
        let preparation: Promise<unknown>;
        try { renderer.setRenderTarget(target); preparation = Promise.all([renderer.compileAsync(warm, camera, scene), renderer.compileAsync(shadows, camera, shadowScene)]); }
        finally { renderer.setRenderTarget(previous); }
        void preparation.then(() => { prepared = count; }).catch(error => { console.error("Lighting preparation failed", error); }).finally(() => { pending = false; });
    };
    return {
        update(): void {
            if (disposed) return;
            reset();
            lights.length = 0;
            camera.updateWorldMatrix(true, false);
            frustum.setFromProjectionMatrix(viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
            scene.traverseVisible(object => {
                if (!(object instanceof THREE.PointLight) || reserveLights.has(object) || !object.layers.test(camera.layers)) return;
                object.updateWorldMatrix(true, false);
                influence.center.setFromMatrixPosition(object.matrixWorld); influence.radius = object.distance;
                if (object.distance > 0 && !object.castShadow && !frustum.intersectsSphere(influence)) { object.visible = false; hidden.push(object); return; }
                lights.push(object);
            });
            // Zero-contribution slots absorb normal AI/orb arrivals without any
            // permutation change. This is capacity, never a limit on real lights.
            const capacity = Math.max(committed, 2 ** Math.ceil(Math.log2(Math.max(16, lights.length))));
            const required = capacity - lights.length;
            while (reserved.children.length > required) reserved.children[reserved.children.length - 1]!.removeFromParent();
            while (reserved.children.length < required) {
                const index = reserved.children.length;
                const light = reservePool[index] ??= new THREE.PointLight(0, 0, .01); light.position.set(-100000, 100000, -100000);
                reserveLights.add(light); reserved.add(light);
            }
            for (const light of reserved.children) lights.push(light as THREE.PointLight);
            const count = lights.length;
            if (committed < 0) committed = count;
            if (prepared === count && committed !== count) {
                committed = count;
                renderer.compile(empty, camera, scene);
            }
            if (count === committed || disposed) return;
            if (!pending) compile(count);
            // Retain exactly the old shader count, including when an orb or
            // factory disappears. Zero-intensity placeholders add no light.
            for (let index = committed; index < count; index++) { lights[index]!.visible = false; hidden.push(lights[index]!); }
            for (let index = count; index < committed; index++) {
                const light = padding[index] ??= new THREE.PointLight(0, 0);
                scene.add(light);
            }
            // compileAsync updates the scene's cached light state. Native
            // shadows consume it before the color pass rebuilds that state;
            // restore it to the retained count without compiling materials.
            renderer.compile(empty, camera, scene);
        },
        reset(): void { reset(); committed = -1; prepared = -1; },
        afterRender(): void {
            if (pending || committed !== prepared) return;
            // The live materials now retain the compiled programs themselves.
            for (const material of owned) material.dispose();
            owned.clear();
        },
        dispose(): void { disposed = true; reset(); reserved.removeFromParent(); reserveLights.clear(); target.dispose(); for (const material of owned) material.dispose(); owned.clear(); }
    };
};
