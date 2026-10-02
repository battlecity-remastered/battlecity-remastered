import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { trackAngle, wrapSignedAngle } from "../src/render/three/turret-tracking.js";
import { createDefenseTurrets } from "../src/render/three/defense-turrets.js";
import { createProjectileCollider } from "../src/render/three/projectile-collider.js";
import { createDemoCombat, type CombatPoint } from "../src/render/three/demo-combat.js";

const loadTurret=async()=> {
    const bytes=await readFile(new URL("../public/assets/models/battlecity-defense-turret.glb",import.meta.url));
    return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"")).scene;
};

test("turret servos take the short path across angle wrap without exceeding their speed",()=> {
    const before=Math.PI-0.02,after=trackAngle(before,-Math.PI+0.02,1/60);
    const delta=Math.atan2(Math.sin(after-before),Math.cos(after-before));
    assert.ok(delta>0 && delta<0.04);
    assert.ok(Math.abs(trackAngle(0,Math.PI,0.01))<=4.8*0.01+1e-8);
});

test("angle shortcuts preserve the original servo trajectory and large-angle handling",()=> {
    const normalize=(angle:number)=>Math.atan2(Math.sin(angle),Math.cos(angle));
    const original=(current:number,target:number,dt:number,speed:number)=>{
        const difference=normalize(target-current),eased=difference*(1-Math.exp(-12*Math.max(0,dt)));
        return normalize(current+Math.max(-speed*dt,Math.min(speed*dt,eased)));
    };
    for(const angle of [0,-0,Math.PI,-Math.PI,3*Math.PI,-3*Math.PI,1e10,-1e10]) {
        assert.ok(Math.abs(normalize(wrapSignedAngle(angle)-normalize(angle)))<1e-12);
    }
    assert.ok(Number.isNaN(wrapSignedAngle(Infinity)));
    for(let i=0;i<1024;i++) {
        const current=(i%97-48)*Math.PI/16,target=(i%71-35)*Math.PI/16,dt=(i%9)/60,speed=i%2?4.8:1.9;
        const expected=original(current,target,dt,speed),actual=trackAngle(current,target,dt,speed);
        assert.ok(Math.abs(normalize(actual-expected))<1e-12,`${i}: ${actual} vs ${expected}`);
    }
});

test("the articulated turret stays within a one-tile footprint while tracking",async()=> {
    const model=await loadTurret(),parts=new Map<string,THREE.Object3D>();
    model.traverse(part=>{if(part.userData.role)parts.set(part.userData.role,part);});
    for(const name of ["defense-head","defense-pitch","defense-gun","defense-muzzle"])assert.ok(parts.has(name));
    for(let heading=0;heading<32;heading++) {
        parts.get("defense-head")!.rotation.y=heading*Math.PI/16;
        parts.get("defense-pitch")!.rotation.x=-0.45;
        const size=new THREE.Box3().setFromObject(model).getSize(new THREE.Vector3());
        assert.ok(size.x<=1 && size.z<=1,`${heading}: ${size.x} by ${size.z}`);
        assert.ok(size.y>1,"tower must retain its raised industrial silhouette");
    }
});

test("aligned turrets fire toward a visible tank, and cover suppresses their shots",async()=> {
    for(const blocked of [false,true]) {
        const tank=new THREE.Group();tank.position.set(0,0,-4);
        const model=await loadTurret();
        const shots: Array<{point:CombatPoint;forward:CombatPoint}>=[];
        const controller=createDefenseTurrets(tank,()=>blocked?{point:{x:0,y:0.5,z:-2},normal:{x:0,y:0,z:1},surface:"metal"}:undefined,
            (point,forward)=>shots.push({point:{...point},forward:{...forward}}));
        controller.register(model);
        const start=performance.now()/1000+2;
        for(let i=0;i<120;i++)controller.update(start+i/60,1/60);
        if(blocked)assert.equal(shots.length,0);
        else {
            assert.ok(shots.length>=2,"visible target must receive a burst");
            for(const shot of shots) {
                assert.ok(shot.forward.z < -0.9 && shot.forward.y<0,"raised cannon must point down toward tank");
                assert.ok(shot.point.y>0.7 && shot.point.z< -0.3,"shot must emerge from the actual elevated barrel");
            }
        }
    }
});

test("turret rounds hit the moving tank mesh while the player's own shots ignore it",()=> {
    const tank=new THREE.Mesh(new THREE.BoxGeometry(0.5,0.5,0.5),new THREE.MeshBasicMaterial());
    tank.position.set(0,0.25,-3);tank.updateMatrixWorld(true);
    const collider=createProjectileCollider();collider.setTarget(tank);
    const from={x:0,y:0.25,z:0},to={x:0,y:0.25,z:-5};
    assert.equal(collider.sweep(from,to,"player"),undefined);
    assert.equal(collider.sweep(from,to,"turret")?.surface,"tank");
    tank.position.x=2;tank.updateMatrixWorld(true);
    assert.equal(collider.sweep(from,to,"turret"),undefined);
    const combat=createDemoCombat(collider.sweep);
    combat.launch({x:2,y:1,z:0},{x:0,y:-0.75,z:-3});
    let hits=0;
    for(let i=0;i<10;i++)hits+=combat.step(0.02,false,from,0).impacts.filter(hit=>hit.surface==="tank").length;
    assert.equal(hits,1);
});
