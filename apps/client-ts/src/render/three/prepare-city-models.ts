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
    const geometries = new Set<THREE.BufferGeometry>(), textures = new Set<THREE.Texture>();
    const uploadMaterial = new THREE.MeshBasicMaterial();
    const addTexture = (value: unknown): void => { if (value instanceof THREE.Texture && !value.isRenderTargetTexture) textures.add(value); };
    for (const source of meshes) {
        if (!geometries.has(source.geometry)) {
            geometries.add(source.geometry);
            const proxy = new THREE.Mesh(source.geometry, uploadMaterial);
            proxy.frustumCulled = false; warm.add(proxy);
        }
        for (const material of Array.isArray(source.material) ? source.material : [source.material]) {
            Object.values(material).forEach(addTexture);
            if (material instanceof THREE.ShaderMaterial) for (const uniform of Object.values(material.uniforms)) addTexture(uniform.value);
        }
    }
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    const previous = renderer.getRenderTarget(), shadowUpdate = renderer.shadowMap.needsUpdate;
    try {
        // Match the composer's linear half-float target during compilation.
        // Compiling against the screen creates unused sRGB shader variants.
        renderer.setRenderTarget(target);
        await renderer.compileAsync(world, camera);
        await renderer.compileAsync(warm, camera);
        for (const texture of textures) renderer.initTexture(texture);
        renderer.shadowMap.needsUpdate = false;
        renderer.render(warm, camera);
    } finally {
        renderer.setRenderTarget(previous); renderer.shadowMap.needsUpdate = shadowUpdate;
        target.dispose(); uploadMaterial.dispose(); warm.clear();
    }
};
