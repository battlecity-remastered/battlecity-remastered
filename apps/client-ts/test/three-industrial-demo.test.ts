import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { decodeMapData } from "../src/world/map-loader.js";
import { FACTORY_PRODUCTS, factoryProduct, createIndustrialDemoLayout, createDefenseDemoLayout } from "../src/render/three/industrial-demo.js";

test("industrial demo fits the actual map and leaves the spawn, apron and factory pickups reachable", async () => {
    const bytes = await readFile(new URL("../public/assets/map.dat", import.meta.url));
    const data = decodeMapData(bytes);
    const originalMap = data.map.map(column => [...column]);
    const originalBlocks = new Set(data.blockingTiles);
    const buildings = createIndustrialDemoLayout(data);
    const defenses = createDefenseDemoLayout(data);
    assert.equal(defenses.length,4);
    assert.equal(buildings.length, 15);
    assert.equal(buildings.filter(building => building.kind === "research").length, 2);
    assert.equal(buildings.find(building => building.kind === "orb-factory")?.type, 105);
    assert.deepEqual(buildings.filter(building => building.kind !== "research").map(building => building.type).sort((a,b)=>a-b),
        FACTORY_PRODUCTS.map((_,type)=>100+type), "every DX factory product must be represented");
    assert.deepEqual(new Set(buildings.map(factoryProduct).filter(Boolean)), new Set(FACTORY_PRODUCTS));
    assert.deepEqual(data.map, originalMap, "district must preserve lava, rocks and city anchors");
    assert.ok([...originalBlocks].every(key => data.blockingTiles.has(key)));
    const plots = new Set<string>();
    for (const building of buildings) for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
        const key = `${building.tileX + dx},${building.tileY + dy}`;
        assert.equal(plots.has(key), false, "building footprints must not overlap");
        plots.add(key);
        assert.equal(data.map[building.tileX + dx]![building.tileY + dy], 0, "build only on dry, clear ground");
        assert.equal(data.blockingTiles.has(key), building.kind === "research" || dy < 2);
    }
    for(const defense of defenses) {
        const key=`${defense.tileX},${defense.tileY}`;
        assert.equal(plots.has(key),false,"defense must not occupy a building or pickup pad");
        assert.equal(data.map[defense.tileX]![defense.tileY],0);
        assert.ok(data.blockingTiles.has(key));
    }
    // Tile centers provide safe lanes for the existing half-tile tank collider.
    const queue: Array<[number,number]> = [[32,33]];
    const reachable = new Set(["32,33"]);
    assert.equal(data.blockingTiles.has("32,33"),false);
    for (let i=0; i<queue.length; i++) {
        const [x,y] = queue[i]!;
        for (const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nx=x+dx!,ny=y+dy!,key=`${nx},${ny}`;
            if(nx<18 || nx>46 || ny<12 || ny>40 || reachable.has(key) || data.blockingTiles.has(key)) continue;
            reachable.add(key);queue.push([nx,ny]);
        }
    }
    for (let x=31; x<34; x++) assert.ok(reachable.has(`${x},33`),"NO PARKING apron must remain walkable");
    for (const building of buildings) {
        const approachY = building.tileY + (building.kind === "research" ? 3 : 2);
        assert.ok(reachable.has(`${building.tileX+1},${approachY}`),`${building.kind} must be approachable from spawn`);
    }
});

for (const name of ["factory","rocket-factory","mine-factory","weapon-factory","orb-factory","research-center","orb-item"]) {
    test(`exported ${name} has moving machinery inside its legacy footprint`, async () => {
        const bytes = await readFile(new URL(`../public/assets/models/battlecity-${name}.glb`,import.meta.url));
        const buffer = bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
        const asset = await new GLTFLoader().parseAsync(buffer,"");
        const moving: THREE.Object3D[]=[];
        asset.scene.traverse(child => { if(child.userData.animated) moving.push(child); });
        assert.ok(asset.animations.length>=2 && moving.length>=2);
        const mixer = new THREE.AnimationMixer(asset.scene);
        for (const clip of asset.animations) mixer.clipAction(clip).play();
        mixer.update(0.01);
        const before = moving.map(part=>({ rotation: part.quaternion.clone(), position: part.position.clone() }));
        mixer.update(0.75);
        moving.forEach((part,i)=>assert.ok(before[i]!.rotation.angleTo(part.quaternion)>0.3 || before[i]!.position.distanceTo(part.position)>0.015,
            `${part.name} must actually change pose`));
        if (name === "research-center") {
            assert.equal(moving.some(part => /fan|turbine/i.test(part.name)), false, "laboratories use containment machinery instead of a large fan");
            assert.ok(moving.some(part => /specimen/i.test(part.name)));
        }
        const size = new THREE.Box3().setFromObject(asset.scene).getSize(new THREE.Vector3());
        const limit = name === "orb-item" ? 1 : 3;
        assert.ok(size.x<=limit && size.z<=limit,`${name}: ${size.x} by ${size.z} tiles`);
        if(name !== "orb-item") assert.ok(size.y>1.8,"industrial silhouette must have substantial height");
    });
}

for (const product of FACTORY_PRODUCTS) {
    test(`DX ${product} pickup fits inside one legacy tile`, async () => {
        const bytes = await readFile(new URL(`../public/assets/models/battlecity-${product}-item.glb`, import.meta.url));
        const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const asset = await new GLTFLoader().parseAsync(buffer, "");
        const bounds = new THREE.Box3().setFromObject(asset.scene);
        const size = bounds.getSize(new THREE.Vector3());
        assert.ok(size.x > 0.2 && size.z > 0.2 && size.y > 0.1, "pickup must have visible geometry");
        assert.ok(size.x <= 1 && size.z <= 1, `${product}: ${size.x} by ${size.z} tiles`);
        assert.ok(bounds.min.y >= -0.001, "pickup must rest above its platform");
    });
}
