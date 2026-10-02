import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createTerrain } from "../src/render/three/terrain.js";

test("3D terrain preserves tile area and lava placement across chunk boundaries", () => {
    const map = Array.from({ length: 64 }, () => Array<number>(64).fill(0));
    map[31]![1] = 1;
    map[32]![1] = 1;
    map[63]![63] = 1;
    map[33]![1] = 2;
    map[5]![5] = 3;
    const scene = new THREE.Scene();
    createTerrain({ map, blockingTiles: new Set(), buildBlockingTiles: new Set() }, scene, new THREE.Texture());
    let solidArea = 0;
    let lavaArea = 0;
    let lavaVertices = 0;
    let lavaTriangles = 0;
    const lavaCells = new Set<string>();
    for (const child of scene.children) {
        if (!(child instanceof THREE.Mesh) || child instanceof THREE.InstancedMesh) continue;
        const positions = child.geometry.getAttribute("position");
        const indices = child.geometry.getIndex()!;
        assert.ok(indices, "terrain must reuse identical vertices");
        assert.ok(child.frustumCulled, "distant terrain chunks must remain cullable");
        if (child.userData.terrainSurface === "lava") {
            lavaVertices += positions.count;
            lavaTriangles += indices.count / 3;
            const normals = child.geometry.getAttribute("normal");
            for (let i = 0; i < positions.count; i++) {
                assert.deepEqual([normals.getX(i), normals.getY(i), normals.getZ(i)], [0, 1, 0]);
                assert.equal(child.geometry.getAttribute("terrainKind").getX(i), 2);
            }
        }
        for (let i = 0; i < indices.count; i += 3) {
            const a = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i));
            const b = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 1));
            const c = new THREE.Vector3().fromBufferAttribute(positions, indices.getX(i + 2));
            const area = b.clone().sub(a).cross(c.clone().sub(a)).length() / 2;
            if (a.y < 0) {
                lavaArea += area;
                const center = a.add(b).add(c).divideScalar(3);
                lavaCells.add(`${Math.floor(center.x + 256)},${Math.floor(center.z + 256)}`);
            } else {
                assert.equal(a.y, 0);
                solidArea += area;
            }
        }
    }
    assert.equal(solidArea, 64 * 64, "masked ground must fill rounded lava corners without gaps");
    assert.equal(lavaArea, 3);
    assert.equal(lavaTriangles, 3 * 8 * 8 * 2, "all shoreline triangles must be retained");
    assert.equal(lavaVertices, 3 * 9 * 9, "shoreline quads share their identical grid vertices");
    assert.deepEqual(lavaCells, new Set(["31,1", "32,1", "63,63"]));
    assert.equal(map[5]![5], 3, "terrain generation must not alter command center anchors");
});

test("rock batches preserve every rock while keeping distant cells separately cullable",()=>{
    const map=Array.from({length:64},()=>Array<number>(64).fill(0));
    for(const [x,y] of [[4,4],[28,28],[36,36]])map[x!]![y!]=2;
    const scene=new THREE.Scene();createTerrain({map,blockingTiles:new Set(),buildBlockingTiles:new Set()},scene,new THREE.Texture());
    const batches=scene.children.filter((object):object is THREE.InstancedMesh=>object instanceof THREE.InstancedMesh);
    assert.equal(batches.reduce((count,batch)=>count+batch.count,0),9);
    assert.equal(batches.length,3,"distant cells cannot share one large culling sphere");
    for(const batch of batches){assert.ok(batch.boundingSphere!.radius<2);assert.ok(batch.castShadow&&batch.receiveShadow);assert.equal(batch.userData.ballisticSurface,"rock");}
});
