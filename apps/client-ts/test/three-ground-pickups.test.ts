import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { configureGroundPickupLayer } from "../src/render/three/ground-pickup-layer.js";

test("ground pickups retain shaders and depth testing without covering the tank", () => {
    const root=new THREE.Group(), group=new THREE.Group(), source=new THREE.MeshStandardMaterial();
    const geometry=new THREE.BoxGeometry(), first=new THREE.Mesh(geometry,source), second=first.clone();
    group.add(first,second);root.add(group); configureGroundPickupLayer(root);
    assert.notEqual(first.material,source);assert.equal(first.material,second.material);
    assert.equal(first.material.onBeforeCompile,source.onBeforeCompile);
    assert.equal(first.material.customProgramCacheKey,source.customProgramCacheKey);
    assert.equal(first.material.depthTest,true);assert.equal(first.material.depthWrite,false);
    assert.equal(first.material.opacity,source.opacity);assert.equal(source.transparent,false);assert.equal(source.depthWrite,true);
    for(const object of [root,group,first,second])assert.equal(object.renderOrder,-2);
    geometry.dispose();first.material.dispose();source.dispose();
});

test("reparenting a pickup retains its owned materials; permanent removal releases them", async () => {
    const root=new THREE.Group(), firstParent=new THREE.Group(), nextParent=new THREE.Group();
    const mesh=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());root.add(mesh);
    configureGroundPickupLayer(root);let disposals=0;mesh.material.addEventListener("dispose",()=>disposals++);
    firstParent.add(root);nextParent.add(root);await Promise.resolve();assert.equal(disposals,0);
    root.removeFromParent();await Promise.resolve();assert.equal(disposals,1);
    mesh.geometry.dispose();
});
