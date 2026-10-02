import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createBuildingBatches } from "../src/render/three/building-batches.js";

const setup=()=>{
    const scene=new THREE.Scene(),geometry=new THREE.BoxGeometry(),material=new THREE.MeshStandardMaterial();
    const root=(x:number)=>{const group=new THREE.Group();group.position.x=x;group.add(new THREE.Mesh(geometry,material));scene.add(group);return group;};
    const roots=[root(1),root(3)];const batches=createBuildingBatches(scene,roots);
    const mesh=()=>scene.children.find(part=>part instanceof THREE.InstancedMesh) as THREE.InstancedMesh;
    return {scene,roots,root,batches,mesh};
};

test("unchanged building parts keep their GPU buffers while exact animated transforms update",()=>{
    const {roots,batches,mesh}=setup();const instanced=mesh(),version=instanced.instanceMatrix.version;
    batches.update();assert.equal(instanced.instanceMatrix.version,version);
    roots[0]!.position.x=1.123456789;batches.update();assert.equal(instanced.instanceMatrix.version,version+1);
    const matrix=new THREE.Matrix4();instanced.getMatrixAt(0,matrix);assert.ok(Math.abs(matrix.elements[12]!-1.123456789)<1e-6);
    const movedVersion=instanced.instanceMatrix.version;batches.update();assert.equal(instanced.instanceMatrix.version,movedVersion,"float32 storage must not create false dirty updates");
    roots[0]!.children[0]!.rotation.y=.4;batches.update();instanced.getMatrixAt(0,matrix);
    assert.ok(Math.abs(matrix.elements[0]!-Math.cos(.4))<1e-6);batches.dispose();
});

test("hidden and removed building ancestors vanish from batches and can reappear",()=>{
    const {scene,roots,batches,mesh}=setup();const matrix=new THREE.Matrix4();
    roots[0]!.visible=false;batches.update();mesh().getMatrixAt(0,matrix);assert.equal(matrix.elements[0],0);
    roots[0]!.visible=true;batches.update();mesh().getMatrixAt(0,matrix);assert.equal(matrix.elements[0],1);
    scene.remove(roots[0]!);batches.update();mesh().getMatrixAt(0,matrix);assert.equal(matrix.elements[0],0);batches.dispose();
});

test("new live buildings share batches and demolition restores the remaining original mesh",()=>{
    const {root,roots,batches,mesh}=setup();const extra=root(5);batches.register(extra);batches.update();
    assert.equal(mesh().count,3);assert.equal(extra.children[0]!.visible,false);
    batches.unregister(extra);assert.equal(mesh().count,2);
    batches.unregister(roots[0]!);assert.equal(batches.count,0);assert.equal(roots[1]!.children[0]!.visible,true);batches.dispose();
});

test("one prepared scene transform matches independent world updates for nested animated parts",()=>{
    const {scene,roots,batches,mesh}=setup();const nested=new THREE.Group();nested.rotation.z=.3;
    nested.add(roots[0]!.children[0]!);roots[0]!.add(nested);
    roots[0]!.position.z=7;scene.updateMatrixWorld();batches.update(true);
    const matrix=new THREE.Matrix4();mesh().getMatrixAt(0,matrix);
    const expected=nested.children[0]!.matrixWorld.elements;for(let i=0;i<16;i++)assert.ok(Math.abs(matrix.elements[i]!-expected[i]!)<1e-6);batches.dispose();
});
