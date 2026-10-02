import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { LEGACY_BOMB_FUSE_MS, isBombStructureInRange } from "@battlecity/sim-core";
import { createClientState } from "../src/app/state.js";
import { detonateDemoBombs } from "../src/app/demo-bombs.js";
import { createBombFuse } from "../src/render/three/bomb-fuse.js";
import { handlers } from "../src/app/network-event-handlers.js";

test("bomb structure range retains the original square tile boundary and footprint intersection",()=>{
    for(let cx=0;cx<20;cx++)for(let cy=0;cy<20;cy++)for(const footprint of [1,3]){
        const nearestX=Math.max(5,Math.min(cx,5+footprint-1)),nearestY=Math.max(5,Math.min(cy,5+footprint-1));
        assert.equal(isBombStructureInRange(5,5,cx,cy,footprint),Math.abs(nearestX-cx)<=1&&Math.abs(nearestY-cy)<=1);
    }
});
test("demo armed bomb waits five seconds, destroys touching structures, clears collisions and spares distant structures",()=>{
    const state=createClientState();state.local.city=0;
    state.hazards.set("bomb",{id:"bomb",cityId:0,type:3,x:5*48,y:6*48,radius:48,armed:true,active:true,fuseEndsAt:LEGACY_BOMB_FUSE_MS});
    for(const [id,tileX,tileY] of [["house",6,6],["far",8,8]] as const)state.buildings.set(id,{id,ownerId:"demo",cityId:0,type:300,tileX,tileY,health:120,maxHealth:120,population:50});
    state.defenses.set("turret",{id:"turret",cityId:0,type:9,tileX:5,tileY:7,health:100,maxHealth:100});state.world.blockingTiles.add("5,7");state.world.blockingTiles.add("6,6");
    assert.equal(detonateDemoBombs(state,4999).buildings.length,0);assert.ok(state.hazards.has("bomb"));
    const result=detonateDemoBombs(state,5000);assert.equal(result.buildings[0]?.id,"house");assert.deepEqual(result.defenses,["turret"]);
    assert.ok(state.buildings.has("far"));assert.equal(state.world.blockingTiles.has("6,6"),false);assert.equal(state.world.blockingTiles.has("5,7"),false);
    assert.equal(state.hazards.size,0);assert.equal(result.blasts.length,1);assert.equal(detonateDemoBombs(state,6000).blasts.length,0);
});
test("unarmed bombs never detonate and fuse materials do not change the factory template",()=>{
    const state=createClientState();state.hazards.set("safe",{id:"safe",cityId:0,type:3,x:0,y:0,radius:48,armed:false,active:false});
    assert.equal(detonateDemoBombs(state,1e9).blasts.length,0);assert.ok(state.hazards.has("safe"));
    const model=new THREE.Group(),original=new THREE.MeshStandardMaterial({emissive:0xff0000,emissiveIntensity:.12});
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(),original);lamp.name="Bomb_armed_lamps";model.add(lamp);
    const fuse=createBombFuse(model);fuse.update(1000,5000);assert.notEqual(lamp.material,original);assert.equal(original.emissiveIntensity,.12);
    const ring=model.children.find(part=>part!==lamp) as THREE.Mesh;assert.ok(ring.visible);const count=ring.geometry.drawRange.count;
    fuse.update(4500,5000);assert.ok(ring.geometry.drawRange.count<count);fuse.update(4500);assert.equal(ring.visible,false);
    fuse.dispose();assert.equal(lamp.material,original);assert.equal(model.children.length,1);lamp.geometry.dispose();original.dispose();
});
test("live hazard removal produces a blast only for detonation, and joins retain remaining fuse time",()=>{
    const state=createClientState();handlers["hazard.spawn"]!(state,{id:"b",cityId:0,type:3,position:{x:240,y:288},radius:48,armed:true,active:true,remainingMs:1200});
    assert.ok(Math.abs(state.hazards.get("b")!.fuseEndsAt!-Date.now()-1200)<50);
    handlers["hazard.remove"]!(state,{id:"b",reason:"detonated"});assert.equal(state.events.effects.explosions.at(-1)?.variant,"large");
    handlers["hazard.spawn"]!(state,{id:"safe",cityId:0,type:3,position:{x:0,y:0},radius:48,armed:false,active:false});
    handlers["hazard.remove"]!(state,{id:"safe",reason:"cleared"});assert.equal(state.events.effects.explosions.length,1);
});
