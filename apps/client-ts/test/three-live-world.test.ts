import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createClientState } from "../src/app/state.js";
import { createLiveWorld } from "../src/render/three/live-world.js";
import { createSupportBuilding } from "../src/render/three/support-buildings.js";

test("live entities appear, move, produce cargo and release presentation resources when removed",()=>{
    const state=createClientState(),scene=new THREE.Scene(),tank=new THREE.Group(),turret=new THREE.Group(),released:THREE.Object3D[]=[];
    const items=new Map([[12,new THREE.Group()]]);
    const world=createLiveWorld(scene,tank,items,turret,building=>{const root=new THREE.Group();root.position.set(building.tileX-254.5,0,building.tileY-255);scene.add(root);return root;},()=>{},model=>released.push(model));
    state.remotePlayers.set("other",{id:"other",city:1,x:1536,y:1536,direction:0});
    state.buildings.set("factory",{id:"factory",ownerId:"mayor",cityId:0,type:112,tileX:30,tileY:26,health:100,maxHealth:100,population:50});
    world.update(state,1/60);assert.equal(scene.children.length,2);const player=scene.children[0]!;const original=player.position.x;
    state.remotePlayers.get("other")!.x+=48;state.factoryStock.set(0,new Map([[12,1]]));world.update(state,1/60);assert.ok(player.position.x>original&&player.position.x<original+1);assert.equal(scene.children.length,3);
    state.factoryStock.get(0)!.set(12,0);world.update(state,1/60);assert.equal(scene.children.length,2);assert.equal(released.length,1);
    state.remotePlayers.clear();state.buildings.clear();world.update(state,1/60);assert.equal(scene.children.length,0);assert.equal(released.length,3);
});

test("hospital and housing are compact shared industrial models within their three-tile plot",()=>{
    for(const type of [200,300]){const model=createSupportBuilding(type),bounds=new THREE.Box3().setFromObject(model),size=bounds.getSize(new THREE.Vector3());assert.ok(size.x<=3.01&&size.z<=3.01);assert.ok(size.y>0.8);let meshes=0;model.traverse(object=>{if(object instanceof THREE.Mesh)meshes++;});assert.ok(meshes<=8,`support building uses ${meshes} material draws`);const clone=createSupportBuilding(type);assert.notEqual(clone,model);assert.equal((clone.children[0] as THREE.Mesh).geometry,(model.children[0] as THREE.Mesh).geometry);}
});

test("enemy sleepers reveal at the classic range and unfold again; active enemy mines and DFG stay concealed",()=>{
    const state=createClientState();state.local.city=0;state.local.x=0;state.local.y=0;
    const scene=new THREE.Scene(),template=new THREE.Group();
    const world=createLiveWorld(scene,template,new Map([[4,template],[7,template],[10,template]]),template,()=>template,()=>{},()=>{});
    state.defenses.set("sleeper",{id:"sleeper",cityId:1,ownerId:"enemy",type:10,tileX:20,tileY:20,health:100,maxHealth:100});
    state.hazards.set("mine",{id:"mine",cityId:1,type:4,x:960,y:960,radius:24,active:true});state.hazards.set("dfg",{id:"dfg",cityId:0,type:7,x:1008,y:960,radius:24,active:true});
    world.update(state,.016);const tower=scene.children.find(child=>child.userData.defenseType===10)!;
    assert.equal(tower.visible,false);assert.equal(scene.children[0]!.visible,false);assert.equal(scene.children[1]!.visible,true);
    state.local.x=960;state.local.y=960;world.update(state,.016);assert.equal(tower.visible,true);assert.ok(tower.userData.deploymentProgress<.1);
    world.update(state,2);assert.equal(tower.userData.deploymentProgress,1);state.local.x=0;state.local.y=0;world.update(state,.016);assert.equal(tower.visible,false);
    state.local.city=1;world.update(state,.016);assert.equal(tower.visible,true);assert.equal(scene.children[0]!.visible,true);assert.equal(scene.children[1]!.visible,false);
});

test("authoritative destruction transfers a model to collapse effects; clearing a city does not explode its buildings",()=>{
    const state=createClientState(),scene=new THREE.Scene(),template=new THREE.Group(),destroyed:THREE.Object3D[]=[],released:THREE.Object3D[]=[];
    const world=createLiveWorld(scene,template,new Map(),template,building=>{const root=new THREE.Group();root.position.set(building.tileX-254.5,0,building.tileY-255);scene.add(root);return root;},()=>{},root=>released.push(root),root=>{destroyed.push(root);return true;});
    for(const id of ["bombed","cleared"])state.buildings.set(id,{id,ownerId:"mayor",cityId:0,type:112,tileX:30,tileY:26,health:100,maxHealth:100,population:50});
    world.update(state,.016);const original=scene.children[0]!;
    world.observe({type:"building.demolished",payload:{id:"bombed",cityId:0}} as Parameters<typeof world.observe>[0]);state.buildings.delete("bombed");world.update(state,.016);
    assert.deepEqual(destroyed,[original]);assert.equal(original.parent,scene,"world renderer leaves the visual remnant to its effect owner");
    state.buildings.delete("cleared");world.update(state,.016);assert.equal(destroyed.length,1);assert.equal(released.length,2);assert.equal(scene.children.length,1);
});
