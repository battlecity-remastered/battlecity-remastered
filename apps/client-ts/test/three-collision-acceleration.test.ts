import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { accelerateCollisionMesh } from "../src/render/three/collision-acceleration.js";

const compareHits=(mesh:THREE.Mesh,original:THREE.Mesh["raycast"],origins:THREE.Vector3[]):void=>{
    for(const origin of origins){
        const raycaster=new THREE.Raycaster(origin,new THREE.Vector3().subVectors(new THREE.Vector3(),origin).normalize(),0,20);
        raycaster.firstHitOnly=true;
        const expected:THREE.Intersection[]=[],actual:THREE.Intersection[]=[];
        original.call(mesh,raycaster,expected);mesh.raycast(raycaster,actual);
        expected.sort((a,b)=>a.distance-b.distance);actual.sort((a,b)=>a.distance-b.distance);
        assert.equal(Boolean(actual[0]),Boolean(expected[0]));
        if(!expected[0])continue;
        assert.ok(actual[0]!.point.distanceTo(expected[0].point)<1e-6);
        assert.ok(Math.abs(actual[0]!.distance-expected[0].distance)<1e-6);
        assert.ok(actual[0]!.face!.normal.distanceTo(expected[0].face!.normal)<1e-6);
        assert.equal(actual[0]!.face!.materialIndex,expected[0].face!.materialIndex);
        assert.equal(actual[0]!.instanceId,expected[0].instanceId);
        assert.equal(actual[0]!.object,mesh);
    }
};

test("accelerated rigid surfaces retain native nearest hits, normals, material groups and triangle order",()=>{
    const geometry=new THREE.BoxGeometry(1,1,1,8,8,8);
    const indices=Array.from(geometry.index!.array),vertices=Array.from(geometry.attributes.position!.array);
    const mesh=new THREE.Mesh(geometry,Array.from({length:6},()=>new THREE.MeshBasicMaterial({side:THREE.DoubleSide})));
    mesh.rotation.set(.23,.61,.07);mesh.scale.set(1.2,.7,1.5);mesh.updateMatrixWorld();
    const original=mesh.raycast;accelerateCollisionMesh(mesh);
    compareHits(mesh,original,[new THREE.Vector3(4,.1,.2),new THREE.Vector3(-4,.2,.1),new THREE.Vector3(.1,4,.1),new THREE.Vector3(.2,.1,-4),new THREE.Vector3(.01,.02,.03)]);
    assert.deepEqual(Array.from(geometry.index!.array),indices);
    assert.deepEqual(Array.from(geometry.attributes.position!.array),vertices);
    const raycaster=new THREE.Raycaster(new THREE.Vector3(4,0,0),new THREE.Vector3(-1,0,0),0,.5);
    assert.deepEqual(raycaster.intersectObject(mesh),[],"finite shell sweep cannot hit a surface beyond its endpoint");
});

test("accelerated rock instances retain transformed hits and the correct instance identity",()=>{
    const rocks=new THREE.InstancedMesh(new THREE.SphereGeometry(.5,24,16),new THREE.MeshBasicMaterial(),2);
    rocks.setMatrixAt(0,new THREE.Matrix4().makeTranslation(1,0,0));
    rocks.setMatrixAt(1,new THREE.Matrix4().compose(new THREE.Vector3(-1,0,0),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),.7),new THREE.Vector3(1,.5,1.5)));
    rocks.rotation.y=.2;rocks.updateMatrixWorld();
    const original=rocks.raycast;accelerateCollisionMesh(rocks);
    compareHits(rocks,original,[new THREE.Vector3(4,0,0),new THREE.Vector3(-4,0,0),new THREE.Vector3(.1,4,.1),new THREE.Vector3(.1,0,4)]);
});

test("deforming vertices keep the native collision path",()=>{
    const geometry=new THREE.SphereGeometry(1,24,16);
    geometry.morphAttributes.position=[geometry.attributes.position!.clone()];
    const mesh=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial());
    const original=mesh.raycast;accelerateCollisionMesh(mesh);
    assert.equal(mesh.raycast,original);assert.equal(geometry.boundsTree,undefined);
});
