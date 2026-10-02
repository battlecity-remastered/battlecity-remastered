import * as THREE from "three";
import type { LoadedMap } from "../../world/map-loader.js";
import { materialPatch1, materialPatch2, materialPatch3, materialPatch4, materialPatch5, materialPatch6 } from "./terrain-shaders.js";
// One render world unit is one 48px legacy tile. Surface decoration follows
// the original cells; collision continues to use the decoded map.
const CENTER = 256;
const CHUNK = 32;
const LAVA_DEPTH = 1.05;
const bankDisplacementGLSL = `
    float bankDistance = min(shoreDistance(position.xz,1.0),max(0.0,lakeOpening(position.xz)-0.54)*0.85);
    float basin = smoothstep(0.0,0.15,bankDistance);
    transformed.y = -0.002-basin*${LAVA_DEPTH};
    transformed.y += (sin(position.x*2.8+terrainTime*0.8)+sin(position.z*3.1-terrainTime*0.6))*0.0025*basin;
`;
const noiseGLSL = materialPatch1;
const makeSurface = (lava: boolean, time: {
    value: number;
}, groundTexture: THREE.Texture, mask: THREE.DataTexture): THREE.MeshStandardMaterial => {
    const material = new THREE.MeshStandardMaterial({
        color: 0xffffff, roughness: lava ? 0.72 : 0.94, metalness: 0.02,
        emissive: lava ? 0xff4a00 : 0x000000, envMapIntensity: lava ? 0.1 : 0.24,
        flatShading: lava,
        map: lava ? null : groundTexture
    });
    material.onBeforeCompile = (shader) => {
        shader.uniforms.terrainTime = time;
        shader.uniforms.terrainMask = { value: mask };
        shader.uniforms.terrainMineral = { value: groundTexture };
        shader.uniforms.terrainMapSize = { value: mask.image.width };
        shader.vertexShader = shader.vertexShader.replace("#include <common>", "#include <common>\n" + noiseGLSL);
        if (lava) {
            shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
                #include <begin_vertex>
                ${bankDisplacementGLSL}
            `);
        }
        shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>", materialPatch2);
        shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + noiseGLSL);
        if (!lava)
            shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", "");
        shader.fragmentShader = shader.fragmentShader.replace("#include <color_fragment>", lava ? `
            #include <color_fragment>
            vec2 p = terrainPosition.xz;
            float liquid = step(${LAVA_DEPTH - 0.06},-terrainPosition.y);
            float heat = 0.0;
            // Keep the texture fetch outside divergent flow so mip selection
            // and anisotropic filtering retain their original derivatives.
            vec3 cliffTexel = texture2D(terrainMineral,p*0.25).rgb;
            if (liquid > 0.0) {
                // Advect the glowing surface past stationary banks. A slower second
                // layer stretches and folds the current into viscous hot ribbons.
                vec2 current = vec2(0.16, -0.10) * terrainTime;
                vec2 moving = p - current;
                vec2 flow = vec2(fbm(moving * 1.3 + terrainTime * 0.025),
                                 fbm(moving * 1.3 + 8.4 - terrainTime * 0.018));
                vec2 warped = moving * 3.4 + flow * 3.0;
                float turbulence = fbm(warped);
                float skin = fbm((p - current * 0.45) * 7.0 + flow * 1.5);
                vec2 raft = cells((p-current*0.45)*2.1+flow*1.8);
                float fracture = 1.0-smoothstep(0.035,0.14,raft.y+(skin-0.5)*0.065);
                float river = smoothstep(0.46,0.70,fbm(warped*0.58));
                heat = max(fracture*0.76,river*0.94);
                heat *= 0.78+turbulence*0.35;
                diffuseColor.rgb = mix(vec3(0.013,0.011,0.009)*(0.7+skin*0.6),vec3(0.20,0.022,0.003),heat);
                vec3 glow = mix(vec3(1.4,0.014,0.001),vec3(3.0,0.34,0.009),pow(heat,3.6));
                totalEmissiveRadiance = glow*pow(heat,1.5);
            } else {
                // The cliff contributes no lava emission or flowing surface.
                diffuseColor.rgb = cliffTexel * (0.25+fbm(p*12.0)*0.16);
                totalEmissiveRadiance = vec3(0.0);
            }
        ` : materialPatch3);
        if (lava) shader.fragmentShader = shader.fragmentShader.replace("#include <roughnessmap_fragment>", materialPatch4);
        shader.fragmentShader = shader.fragmentShader.replace("#include <normal_fragment_maps>", materialPatch5);
    };
    material.customProgramCacheKey = () => lava ? "dx-lava-cliff-v12" : "dx-earth-clean-rim-v10";
    return material;
};
type TerrainVertices = { positions: number[]; indices: number[]; lookup: Map<string, number> };
const createVertices = (): TerrainVertices => ({ positions: [], indices: [], lookup: new Map() });
const addVertex = (vertices: TerrainVertices, x: number, y: number, z: number): number => {
    const key = `${x},${y},${z}`;
    const existing = vertices.lookup.get(key);
    if (existing !== undefined) return existing;
    const index = vertices.positions.length / 3;
    vertices.positions.push(x, y, z);
    vertices.lookup.set(key, index);
    return index;
};
const addQuad = (vertices: TerrainVertices, x: number, z: number, width: number, depth: number, y: number): void => {
    x -= CENTER;
    z -= CENTER;
    // Retain the exact triangle order and coordinates. Adjacent quads reuse
    // vertices so the expensive lava-bank shader runs once per shared point.
    const a = addVertex(vertices, x, y, z), b = addVertex(vertices, x, y, z + depth);
    const c = addVertex(vertices, x + width, y, z), d = addVertex(vertices, x + width, y, z + depth);
    vertices.indices.push(a, b, c, c, b, d);
};
export const createTerrain = (data: LoadedMap, scene: THREE.Scene, groundTexture: THREE.Texture): {
    update: (seconds: number) => void;
    dispose: () => void;
    configureDepthMaterial: (material: THREE.MeshNormalMaterial) => void;
} => {
    const time = { value: 0 };
    const size = data.map.length;
    const pixels = new Uint8Array(size * size);
    for (let z = 0; z < size; z++) for (let x = 0; x < size; x++) pixels[z * size + x] = data.map[x]?.[z] === 1 ? 255 : 0;
    const mask = new THREE.DataTexture(pixels, size, size, THREE.RedFormat);
    mask.minFilter = mask.magFilter = THREE.LinearFilter;
    mask.needsUpdate = true;
    const earth = makeSurface(false, time, groundTexture, mask);
    const lava = makeSurface(true, time, groundTexture, mask);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0xb28a68, map: groundTexture, roughness: 0.93, flatShading: true });
    const rockGeometry = new THREE.IcosahedronGeometry(1, 2);
    const rockVertices = rockGeometry.getAttribute("position");
    for (let i = 0; i < rockVertices.count; i++) {
        const x = rockVertices.getX(i), y = rockVertices.getY(i), z = rockVertices.getZ(i);
        const erosion = 0.87 + 0.11 * Math.sin(x * 17 + y * 13 + z * 19);
        rockVertices.setXYZ(i, x * erosion, y * erosion, z * erosion);
    }
    rockGeometry.computeVertexNormals();
    const addTerrainMeshes = (solidVertices: ReturnType<typeof createVertices>, moltenVertices: ReturnType<typeof createVertices>) => {
        for (const [vertices, material, surface] of [[solidVertices, earth, "ground"], [moltenVertices, lava, "lava"]] as const) {
            if (!vertices.indices.length)
                continue;
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices.positions, 3));
            geometry.setIndex(vertices.indices);
            geometry.setAttribute("terrainKind", new THREE.Float32BufferAttribute(new Float32Array(vertices.positions.length / 3).fill(surface === "lava" ? 2 : 1), 1));
            geometry.computeVertexNormals();
            geometry.computeBoundingSphere();
            // Shader displacement lifts the lip above the stored floor.
            if (surface === "lava" && geometry.boundingSphere) geometry.boundingSphere.radius += LAVA_DEPTH;
            const mesh = new THREE.Mesh(geometry, material);
            // Opaque buildings populate depth first, rejecting terrain
            // fragments beneath them before their detailed surface shading.
            mesh.renderOrder = 1;
            mesh.userData.terrainSurface = surface;
            mesh.receiveShadow = true;
            mesh.updateMatrix(); mesh.matrixAutoUpdate = false;
            scene.add(mesh);
        }
    };
    const isLava = (x: number, z: number): boolean => data.map[x]?.[z] === 1;
    for (let cx = 0; cx < size; cx += CHUNK)
        for (let cz = 0; cz < size; cz += CHUNK) {
            const rockPositions: Array<[
                number,
                number
            ]> = [];
            const solidVertices = createVertices(), moltenVertices = createVertices();
            for (let z = cz; z < Math.min(size, cz + CHUNK); z++) {
                // A masked ground underlay fills rounded-off lava corners. The
                // opening is cut in the shader, using the same cell field as lava.
                addQuad(solidVertices, cx, z, Math.min(size, cx + CHUNK) - cx, 1, 0);
                for (let x = cx; x < Math.min(size, cx + CHUNK); x++) {
                    if (data.map[x]?.[z] === 2)
                        rockPositions.push([x, z]);
                    if (!isLava(x, z))
                        continue;
                    // Tessellation gives the recessed basin a real sloping bank,
                    // rather than a flat image with a dark border.
                    const shoreline = [-1, 0, 1].some(dx => [-1, 0, 1].some(dz => !isLava(x + dx, z + dz)));
                    const divisions = shoreline ? 8 : 1;
                    for (let rz = 0; rz < divisions; rz++) for (let rx = 0; rx < divisions; rx++)
                        addQuad(moltenVertices, x + rx / divisions, z + rz / divisions, 1 / divisions, 1 / divisions, -LAVA_DEPTH);
                }
            }
            addTerrainMeshes(solidVertices, moltenVertices);
            addDecorations(scene, rockPositions, rockGeometry, rockMaterial);
        }
    return {
        update: (seconds) => { time.value = seconds; },
        dispose: () => mask.dispose(),
        // AO's override material must see the same holes and bank displacement
        // as the color pass, otherwise it shades an imaginary flat tiled floor.
        configureDepthMaterial: (material) => {
            material.flatShading = true;
            Object.assign(material, { defaultAttributeValues: { terrainKind: [0] } });
            material.onBeforeCompile = shader => {
                shader.uniforms.terrainTime = time;
                shader.uniforms.terrainMask = { value: mask };
                shader.uniforms.terrainMapSize = { value: size };
                shader.vertexShader = shader.vertexShader.replace("#include <common>",
                    "#include <common>\n" + noiseGLSL + "\nattribute float terrainKind; varying float depthTerrainKind;");
                shader.vertexShader = shader.vertexShader.replace("#include <begin_vertex>", `
                    #include <begin_vertex>
                    depthTerrainKind = terrainKind;
                    if(terrainKind>1.5) {
                        ${bankDisplacementGLSL}
                    }
                `);
                shader.vertexShader = shader.vertexShader.replace("#include <project_vertex>",
                    "terrainPosition = transformed;\n#include <project_vertex>");
                shader.fragmentShader = noiseGLSL + "\nvarying float depthTerrainKind;\n" + shader.fragmentShader;
                shader.fragmentShader = shader.fragmentShader.replace("#include <clipping_planes_fragment>", materialPatch6);
            };
            material.customProgramCacheKey = () => "dx-terrain-depth-v2";
        }
    };
};
// Bound each instance batch to its own chunk so distant rocks are culled.
const addDecorations = (scene: THREE.Scene, rockPositions: Array<[number, number]>,
    rockGeometry: THREE.BufferGeometry, rockMaterial: THREE.Material): void => {
    // Keep the identical rocks, but cull small batches rather than drawing all
    // 32x32-tile instances when a single corner of their chunk is visible.
    const batches = new Map<string, Array<[number, number]>>();
    for (const position of rockPositions) { const key = `${Math.floor(position[0] / 8)},${Math.floor(position[1] / 8)}`; const batch = batches.get(key) ?? []; batch.push(position); batches.set(key, batch); }
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (const batch of batches.values()) {
        const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, batch.length * 3);
        rocks.userData.ballisticSurface = "rock";
        batch.forEach(([x, z], i) => {
            for (let part = 0; part < 3; part++) {
                const seed = x * 17 + z * 31 + part * 43;
                dummy.position.set(x - CENTER + 0.5 + (part - 1) * 0.19, 0.15 + 0.05 * Math.sin(seed), z - CENTER + 0.5 + Math.sin(seed) * 0.12);
                dummy.rotation.set(Math.sin(seed) * 0.4, seed * 0.71, Math.cos(seed) * 0.3);
                dummy.scale.set(part === 1 ? 0.26 : 0.18, 0.23 + (seed % 7) * 0.025, part === 1 ? 0.3 : 0.22);
                dummy.updateMatrix();
                rocks.setMatrixAt(i * 3 + part, dummy.matrix);
                rocks.setColorAt(i * 3 + part, color.setRGB(0.7 + (seed % 7) * 0.07, 0.68 + (seed % 9) * 0.035, 0.6 + (seed % 5) * 0.04));
            }
        });
        rocks.computeBoundingSphere();
        rocks.castShadow = true;
        rocks.receiveShadow = true;
        rocks.updateMatrix(); rocks.matrixAutoUpdate = false;
        scene.add(rocks);
    }
};
