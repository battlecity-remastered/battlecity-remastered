import * as THREE from "three";

// Load each shared city geometry once, rather than uploading a city's entire
// model collection on the first frame in which it enters the camera.
export const collectCityMeshes = (roots: Iterable<THREE.Object3D>): THREE.Mesh[] => {
    const unique = new Map<string, THREE.Mesh>();
    for (const root of roots) root.traverse(object => {
        if (!(object instanceof THREE.Mesh) || object instanceof THREE.SkinnedMesh) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const key = `${object.geometry.uuid}/${materials.map(material => material.uuid).join("/")}/${object.receiveShadow}`;
        unique.set(key, object);
    });
    return [...unique.values()];
};

export const prepareCityModels = async (
    renderer: THREE.WebGLRenderer, world: THREE.Scene, camera: THREE.Camera,
    roots: Iterable<THREE.Object3D>
): Promise<void> => {
    const meshes = collectCityMeshes(roots);
    const warm = new THREE.Scene();
    const materialWarmup = new THREE.Group();
    const geometries = new Set<THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
    const uploadMaterial = new THREE.MeshBasicMaterial();
    const uploadMaterials = new Map<THREE.Side, THREE.MeshBasicMaterial>([[THREE.FrontSide, uploadMaterial]]);
    const addTexture = (value: unknown): void => { if (value instanceof THREE.Texture && !value.isRenderTargetTexture) textures.add(value); };
    for (const source of meshes) {
        // Keep the templates' real material references alive: future clones
        // can acquire their already-compiled programs without first-use stalls.
        materialWarmup.add(source.clone(false));
        if (!geometries.has(source.geometry)) {
            geometries.add(source.geometry);
            const proxy = source.clone(false);
            const sourceMaterial = Array.isArray(source.material) ? source.material[0]! : source.material;
            let material = uploadMaterials.get(sourceMaterial.side);
            if (!material) { material = new THREE.MeshBasicMaterial({ side: sourceMaterial.side }); uploadMaterials.set(sourceMaterial.side, material); }
            proxy.material = material;
            proxy.frustumCulled = false; proxy.castShadow = source.castShadow; warm.add(proxy);
        }
        for (const material of Array.isArray(source.material) ? source.material : [source.material]) {
            Object.values(material).forEach(addTexture);
            if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) addTexture(uniform.value);
        }
    }
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    // Exercise native depth variants for every template, including mayor/orb
    // geometry that may first arrive with an AI city after the player joins.
    const sun = new THREE.DirectionalLight(); sun.castShadow = true;
    sun.shadow.mapSize.set(1, 1); sun.position.set(0, 25, 0);
    warm.add(sun, sun.target);
    const previous = renderer.getRenderTarget(), shadowUpdate = renderer.shadowMap.needsUpdate;
    try {
        // Match the composer's linear half-float target during compilation.
        // Compiling against the screen creates unused sRGB shader variants.
        renderer.setRenderTarget(target);
        await renderer.compileAsync(materialWarmup, camera, world);
        await renderer.compileAsync(world, camera);
        await renderer.compileAsync(warm, camera);
        for (const texture of textures) renderer.initTexture(texture);
        renderer.shadowMap.needsUpdate = true;
        renderer.render(warm, camera);
    } finally {
        renderer.setRenderTarget(previous); renderer.shadowMap.needsUpdate = shadowUpdate;
        target.dispose(); for (const material of uploadMaterials.values()) material.dispose(); sun.shadow.dispose(); warm.clear();
    }
};
