import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { cannonForward, createDemoCombat, TANK_MUZZLE_DISTANCE, TANK_MUZZLE_HEIGHT, SHELL_SPEED } from "../src/render/three/demo-combat.js";
import { createProjectileCollider } from "../src/render/three/projectile-collider.js";

const muzzle={x:0,y:TANK_MUZZLE_HEIGHT,z:-TANK_MUZZLE_DISTANCE};

test("held fire has a cooldown; releasing stops new shots and old shells expire",()=> {
    const combat=createDemoCombat(()=>undefined);
    let shots=0;
    for(let i=0;i<100;i++) shots+=combat.step(0.02,true,muzzle,0).shots.length;
    assert.equal(shots,3);
    for(let i=0;i<150;i++) assert.equal(combat.step(0.02,false,muzzle,0).shots.length,0);
    assert.equal(combat.shells.length,0);
});

test("ballistics remain consistent across frame rates and preserve tank heading",()=> {
    for(const heading of [0,8,16,24,3.7]) {
        const fine=createDemoCombat(()=>undefined),coarse=createDemoCombat(()=>undefined);
        fine.step(0,true,muzzle,heading);coarse.step(0,true,muzzle,heading);
        for(let i=0;i<100;i++) fine.step(0.01,false,muzzle,heading);
        for(let i=0;i<10;i++) coarse.step(0.1,false,muzzle,heading);
        const a=fine.shells[0]!.position,b=coarse.shells[0]!.position,forward=cannonForward(heading);
        assert.ok(Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z)<1e-8);
        assert.ok(Math.abs(a.x-muzzle.x-forward.x*SHELL_SPEED)<1e-8);
        assert.ok(Math.abs(a.z-muzzle.z-forward.z*SHELL_SPEED)<1e-8);
        assert.ok(a.y<TANK_MUZZLE_HEIGHT,"shell follows a shallow falling arc");
    }
});

test("rendering stalls do not slow the fire cooldown or create catch-up bursts",()=> {
    const combat=createDemoCombat(()=>undefined);
    assert.equal(combat.step(0.016,true,muzzle,0,10).shots.length,1);
    assert.equal(combat.step(0.016,true,muzzle,0,10.4).shots.length,0);
    assert.equal(combat.step(0.016,true,muzzle,0,11).shots.length,1);
    assert.equal(combat.step(0.016,true,muzzle,0,30).shots.length,1);
    assert.equal(combat.step(0.016,true,muzzle,0,30.01).shots.length,0);
});

test("swept collisions find the closest actual surface across spatial buckets",()=> {
    const collider=createProjectileCollider();
    for(const x of [18,9]) {
        const wall=new THREE.Mesh(new THREE.BoxGeometry(0.10,1,1),new THREE.MeshBasicMaterial());
        wall.position.set(x,0.5,0);collider.register(wall,"metal");
    }
    const hit=collider.sweep({x:0,y:0.427,z:0},{x:24,y:0.427,z:0});
    assert.ok(hit);assert.ok(Math.abs(hit.point.x-8.95)<1e-6);
    assert.equal(hit.surface,"metal");assert.ok(hit.normal.x < -0.99);
    const combat=createDemoCombat(collider.sweep);
    combat.step(0,true,{x:0,y:0.427,z:0},8);
    let impacts=0;
    for(let i=0;i<5;i++) impacts+=combat.step(0.1,false,muzzle,8).impacts.length;
    assert.equal(impacts,1);assert.equal(combat.shells.length,0);
});

test("a protruding barrel cannot fire through cover",()=> {
    const collider=createProjectileCollider();
    const wall=new THREE.Mesh(new THREE.BoxGeometry(1,1,0.05),new THREE.MeshBasicMaterial());
    wall.position.set(0,0.5,-0.28);collider.register(wall,"metal");
    const combat=createDemoCombat(collider.sweep);
    const event=combat.step(0,true,muzzle,0);
    assert.equal(event.shots.length,1);assert.equal(event.impacts.length,1);assert.equal(combat.shells.length,0);
});

test("instanced rock surfaces use the transformed face normal; shells fly above lava",()=> {
    const collider=createProjectileCollider((x)=>x<0?-1.05:0.005);
    assert.equal(collider.sweep({x:-5,y:0.4,z:0},{x:-4,y:0.3,z:0}),undefined);
    const rocks=new THREE.InstancedMesh(new THREE.BoxGeometry(0.4,0.8,0.4),new THREE.MeshBasicMaterial(),1);
    const transform=new THREE.Matrix4().compose(new THREE.Vector3(2,0.4,0),new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),Math.PI/4),new THREE.Vector3(1,1,1));
    rocks.setMatrixAt(0,transform);collider.register(rocks,"rock");
    const hit=collider.sweep({x:0,y:0.4,z:0},{x:3,y:0.4,z:0});
    assert.equal(hit?.surface,"rock");assert.ok(Math.abs(hit!.normal.x+Math.SQRT1_2)<1e-6);
    assert.ok(Math.abs(Math.abs(hit!.normal.z)-Math.SQRT1_2)<1e-6);
    const ground=collider.sweep({x:-1,y:0.01,z:0},{x:-0.5,y:-0.01,z:0});
    assert.equal(ground,undefined,"original lava cells are open basins rather than projectile walls");
});

test("Blender's muzzle socket matches cannon geometry at every legacy heading",async()=> {
    const bytes=await readFile(new URL("../public/assets/models/battlecity-tank.glb",import.meta.url));
    const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");
    let socket: THREE.Object3D | undefined,gun: THREE.Object3D | undefined;
    asset.scene.traverse(part=> {if(part.userData.role==="tank-muzzle") socket=part;if(part.userData.role==="tank-gun") gun=part;});
    assert.ok(socket && gun);
    for(let heading=0;heading<32;heading++) {
        asset.scene.rotation.y=-heading*Math.PI/16;asset.scene.updateMatrixWorld(true);
        const point=socket.getWorldPosition(new THREE.Vector3()),forward=cannonForward(heading);
        assert.ok(Math.abs(point.x-forward.x*TANK_MUZZLE_DISTANCE)<1e-6);
        assert.ok(Math.abs(point.z-forward.z*TANK_MUZZLE_DISTANCE)<1e-6);
        assert.ok(Math.abs(point.y-TANK_MUZZLE_HEIGHT)<1e-6);
    }
});


test("turret sweeps share tank bounds within a frame and refresh after driving or recoil",()=> {
    const collider=createProjectileCollider();
    const tank=new THREE.Group(),gun=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
    tank.add(gun);collider.setTarget(tank);
    let refreshes=0;
    const updateWorldMatrix=tank.updateWorldMatrix.bind(tank);
    tank.updateWorldMatrix=(parents,children)=>{refreshes++;updateWorldMatrix(parents,children);};
    const shoot=()=>collider.sweep({x:-2,y:0,z:0},{x:3,y:0,z:0},"turret");
    collider.beginFrame();
    assert.equal(shoot()?.point.x,-.5);
    const prepared=refreshes;assert.ok(prepared>0);
    for(let i=0;i<20;i++)assert.equal(shoot()?.point.x,-.5);
    assert.equal(refreshes,prepared,"shell substeps reuse prepared tank bounds");
    tank.position.x=1;gun.position.x=.25;
    collider.beginFrame();
    assert.equal(shoot()?.point.x,.75,"new frame uses the moved tank and articulated gun");
    assert.ok(refreshes>prepared,"the next frame refreshes the moved target");
    const moved=refreshes;
    assert.equal(shoot()?.point.x,.75);
    assert.equal(refreshes,moved);
    assert.equal(collider.sweep({x:-2,y:0,z:0},{x:3,y:0,z:0},"player"),undefined,"tank cannot shoot itself");
});

test("standalone collider sweeps keep tracking targets without an explicit frame cache",()=> {
    const collider=createProjectileCollider();
    const tank=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial());
    collider.setTarget(tank);
    const shoot=()=>collider.sweep({x:-2,y:0,z:0},{x:3,y:0,z:0},"turret");
    assert.equal(shoot()?.point.x,-.5);
    tank.position.x=1;
    assert.equal(shoot()?.point.x,.5);
});
