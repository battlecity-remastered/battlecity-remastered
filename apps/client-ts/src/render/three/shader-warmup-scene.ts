import * as THREE from "three";

const createShadowDepth = (source: THREE.Material, owned: Set<THREE.Material>): THREE.MeshDepthMaterial => {
    const depth = new THREE.MeshDepthMaterial();
    const surface = source as THREE.MeshStandardMaterial;
    Object.assign(depth, { side: source.shadowSide ?? (source.side === THREE.DoubleSide ? THREE.DoubleSide : source.side === THREE.FrontSide ? THREE.BackSide : THREE.FrontSide), map: surface.map, alphaMap: surface.alphaMap, alphaTest: source.alphaTest, wireframe: surface.wireframe, displacementMap: surface.displacementMap, displacementScale: surface.displacementScale, displacementBias: surface.displacementBias, clippingPlanes: source.clippingPlanes, clipIntersection: source.clipIntersection, clipShadows: source.clipShadows });
    owned.add(depth);
    return depth;
};

export const createShaderWarmupScene = (scene: THREE.Scene, normal: THREE.MeshNormalMaterial, owned: Set<THREE.Material>) => {
    const warm = new THREE.Group(), shadows = new THREE.Group(), shadowScene = new THREE.Scene(), seen = new Set<string>();
    const copy = (material: THREE.Material): THREE.Material => {
        const cloned = material.clone(); cloned.onBeforeCompile = material.onBeforeCompile;
        cloned.customProgramCacheKey = material.customProgramCacheKey;
        owned.add(cloned);
        return cloned;
    };
    // Native shadows pass scene=null, so their keys must have no scene fog.
    scene.traverseVisible(object => { if (object instanceof THREE.Light) shadowScene.add(object.clone(false)); });
    scene.traverse(object => {
        if (!(object instanceof THREE.Mesh || object instanceof THREE.Points || object instanceof THREE.Line || object instanceof THREE.Sprite)) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        const key = `${object.type}/${object.geometry?.uuid}/${materials.map(material => material.uuid).join("/")}/${object instanceof THREE.Mesh && object.receiveShadow}`;
        if (seen.has(key)) return;
        seen.add(key);
        const add = (material: THREE.Material | THREE.Material[], group = warm): void => { const proxy = object.clone(false); proxy.material = material; group.add(proxy); };
        add(Array.isArray(object.material) ? materials.map(copy) : copy(object.material));
        if (!(object instanceof THREE.Mesh)) return;
        add(copy(normal));
        if (!object.castShadow) return;
        // Match WebGLShadowMap's directional-light depth material. Its cache
        // key also contains the point-light count despite having no lighting.
        for (const source of materials) {
            const depth = object.customDepthMaterial ? copy(object.customDepthMaterial) : createShadowDepth(source, owned);
            add(depth, shadows);
        }
    });
    return { warm, shadows, shadowScene };
};
