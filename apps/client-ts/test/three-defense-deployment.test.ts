import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { createDeployedDefense } from "../src/render/three/deployed-defense.js";
import { resolveTankDropTarget } from "../src/render/three/tank-drop-target.js";
import { createClientState } from "../src/app/state.js";
import { createThreeGameActions } from "../src/app/three-game-actions.js";
import type { EventSender } from "../src/network/events.js";

test("deployment unfolds in place and plasma keeps its DX receiver on the raised tower",()=>{
    const turret=new THREE.Group(),head=new THREE.Group();head.userData.role="defense-head";head.position.y=1.025;head.add(new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial()));turret.add(head);
    const item=new THREE.Group();item.name="DX plasma receiver";
    const deployed=createDeployedDefense(11,turret,item);deployed.root.position.set(4.5,0,5.5);assert.equal(deployed.root.userData.deploymentProgress,0);
    const receiver=deployed.root.getObjectByName(item.name);assert.ok(receiver);assert.equal(receiver.parent?.position.y,1.025);
    deployed.update(.675,8);assert.ok(deployed.root.userData.deploymentProgress>0&&deployed.root.userData.deploymentProgress<1);deployed.update(1,8);assert.equal(deployed.root.userData.deploymentProgress,1);assert.deepEqual(deployed.root.position.toArray(),[4.5,0,5.5]);assert.equal(deployed.root.children[0]!.scale.y,1);deployed.dispose();
    const hydrated=createDeployedDefense(8,turret,item,false);assert.equal(hydrated.root.userData.deploymentProgress,1);
});

test("all defense drops keep the original padded tank tile irrespective of heading; blocked tiles never relocate",()=>{
    for(const type of [8,9,10,11])for(let direction=0;direction<32;direction++){
        const state=createClientState();state.local.id="pilot";state.debug.socketConnected=true;state.local.x=231;state.local.y=240;state.local.direction=direction;state.inventory.set(type,1);
        const events:Array<{type:string;payload:unknown}>=[];const send:EventSender=(type,payload)=>events.push({type,payload});
        assert.deepEqual(resolveTankDropTarget(state),{tileX:5,tileY:5,x:240,y:240});assert.equal(createThreeGameActions(state,send).deploy(type),true);assert.equal(events[0]!.type,"defense.deploy.request");assert.deepEqual(events[0]!.payload,{cityId:state.local.city,type,tileX:5,tileY:5,fromInventory:true});assert.equal(state.inventory.get(type),1);
        assert.equal(resolveTankDropTarget(state,new Set(["5,5"])),null);
        state.defenses.set("blocked",{id:"blocked",ownerId:"pilot",cityId:state.local.city,type:8,tileX:5,tileY:5,health:100,maxHealth:100});
        assert.equal(createThreeGameActions(state,send).deploy(type),false);assert.equal(events.length,1);
    }
});
