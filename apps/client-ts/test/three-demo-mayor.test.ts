import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createClientState } from "../src/app/state.js";
import { initializeDemoMayor,placeDemoBuilding } from "../src/app/demo-mayor.js";
import { canOpenBuildMenu,resolveBuildMenuEntries } from "../src/ui/build-menu/BuildMenu.js";
import { createRoleTank,updateTankRole,isMayorTank } from "../src/render/three/tank-role.js";

test("demo mayor can build housing and access unlocked construction without a socket",()=>{
    const state=createClientState();initializeDemoMayor(state,[]);assert.equal(canOpenBuildMenu(state),true);assert.ok(resolveBuildMenuEntries(state).some(entry=>entry.type===300&&entry.state==="available"));assert.ok(resolveBuildMenuEntries(state).some(entry=>entry.type===105&&entry.state==="available"));
    assert.equal(placeDemoBuilding(state,300,40,40),true);const house=[...state.buildings.values()].find(building=>building.type===300)!;assert.equal(house.population,0);assert.equal(placeDemoBuilding(state,300,40,40),false);
});
test("mayor appearance follows authoritative role assignment and promotion for each tank",()=>{
    const state=createClientState();initializeDemoMayor(state,[]);const root=createRoleTank(new THREE.Group(),new THREE.Group());updateTankRole(root,isMayorTank(state,state.local.id));assert.equal(root.children[0]!.visible,false);assert.equal(root.children[1]!.visible,true);
    state.lobby.assignments[0]!.mayorId="promoted";updateTankRole(root,isMayorTank(state,state.local.id));assert.equal(root.children[0]!.visible,true);assert.equal(root.children[1]!.visible,false);assert.equal(isMayorTank(state,"promoted"),true);
});

test("exported mayor tank and housing preserve their legacy footprints and housing has roof-visible glazing",async()=>{
    const {readFile}=await import("node:fs/promises");const {GLTFLoader}=await import("three/addons/loaders/GLTFLoader.js");
    for(const name of ["mayor-tank","housing"]){const bytes=await readFile(new URL(`../public/assets/models/battlecity-${name}.glb`,import.meta.url));const asset=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),"");const size=new THREE.Box3().setFromObject(asset.scene).getSize(new THREE.Vector3());const limit=name==="housing"?3:1;assert.ok(size.x<=limit&&size.z<=limit,`${name} must retain its gameplay footprint`);assert.ok(size.y>0.4);if(name==="housing"){let warm=false,glass=false;asset.scene.traverse(part=>{if(part instanceof THREE.Mesh){const materials=Array.isArray(part.material)?part.material:[part.material];warm||=materials.some(material=>material.name.includes("warm window"));glass||=materials.some(material=>material.name==="Habitat cyan window glow");}});assert.ok(warm&&glass);}}
});

test("AI mayor appearance follows snapshot bot role without a human lobby assignment",()=>{
    const state=createClientState();state.remotePlayers.set("bot",{id:"bot",city:17,direction:0,x:0,y:0,botRole:"mayor"});
    assert.equal(isMayorTank(state,"bot"),true);state.remotePlayers.get("bot")!.botRole="miner";assert.equal(isMayorTank(state,"bot"),false);
});
