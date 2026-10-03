import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

// World-space vertices avoid BatchedMesh's matrix/indirection texture fetches.
// Keep a second, unchanged position attribute for material-local procedural
// wear and machinery emission. UVs, colours, topology and normals are retained.
export const mergeStaticBuildingGeometry = (sources: readonly THREE.Mesh[], matrices?: Float64Array): THREE.BufferGeometry => {
    const transform = new THREE.Matrix4();
    const parts = sources.map((source, index) => {
        const geometry = source.geometry.clone();
        geometry.setAttribute("buildingLocalPosition", source.geometry.attributes.position!.clone());
        geometry.applyMatrix4(matrices ? transform.fromArray(matrices, index * 16) : source.matrixWorld);
        return geometry;
    });
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) throw new Error("Static building attribute layouts must match");
    geometry.computeBoundingSphere(); return geometry;
};

export const preserveBuildingLocalShading = (material: THREE.Material, source: THREE.Material): void => {
    material.onBeforeCompile = (shader, renderer) => {
        source.onBeforeCompile(shader, renderer);
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\nattribute vec3 buildingLocalPosition;")
            .replaceAll("finishPosition = transformed;", "finishPosition = buildingLocalPosition;")
            .replaceAll("machinePosition = transformed;", "machinePosition = buildingLocalPosition;");
    };
    material.customProgramCacheKey = () => `${source.customProgramCacheKey()}/static-local-position-v1`;
};
