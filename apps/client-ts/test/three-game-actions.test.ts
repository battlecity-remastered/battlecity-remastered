import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createThreeGameActions } from "../src/app/three-game-actions.js";
import type { EventSender } from "../src/network/events.js";

test("live weapons require inventory and cooldown; inventory changes wait for server confirmation",()=>{
    const state=createClientState(),events:Array<{type:string;payload:unknown}>=[];state.local.id="pilot";state.debug.socketConnected=true;
    const send:EventSender=(type,payload)=>{events.push({type,payload});};const actions=createThreeGameActions(state,send);
    actions.fire("laser");assert.equal(events.length,0);state.inventory.set(12,1);actions.fire("laser");actions.fire("laser");assert.equal(events.length,1);assert.equal(events[0]!.type,"bullet.fire.request");assert.equal(state.inventory.get(12),1);
    const medkit=createThreeGameActions(state,send);state.inventory.set(2,1);assert.equal(medkit.deploy(2,true),true);assert.equal(events.at(-1)!.type,"item.use.request");assert.equal(state.inventory.get(2),1);
    state.debug.socketConnected=false;assert.equal(createThreeGameActions(state,send).deploy(2,true),false);
});

test("orbs can only be submitted from an enemy command centre apron",()=>{
    const state=createClientState(),events:Array<{type:string;payload:unknown}>=[];state.local.id="pilot";state.debug.socketConnected=true;state.inventory.set(5,1);
    const send:EventSender=(type,payload)=>{events.push({type,payload});};assert.equal(createThreeGameActions(state,send).deploy(5),false);
    state.local.x=95*48+48;state.local.y=33*48;assert.equal(createThreeGameActions(state,send).deploy(5),true);assert.equal(events.at(-1)!.type,"orb.drop.request");assert.equal(state.inventory.get(5),1);
});

test("U chooses the nearby stocked factory or dropped icon, without requesting remote stock",()=>{
    const state=createClientState(),events:Array<{type:string;payload:unknown}>=[];
    state.local.id="pilot";state.local.city=0;state.debug.socketConnected=true;
    state.factoryStock.set(0,new Map([[12,4],[1,4]]));state.ui.selectedInventoryItemType=1;
    state.buildings.set("laser",{id:"laser",ownerId:"pilot",cityId:0,type:112,tileX:20,tileY:20,health:100,maxHealth:100,population:50});
    const send:EventSender=(type,payload)=>events.push({type,payload});
    assert.equal(createThreeGameActions(state,send).collect(),null);assert.equal(events.length,0);
    state.local.x=20*48+56;state.local.y=20*48+102;
    assert.equal(createThreeGameActions(state,send).collect(),12);
    assert.deepEqual(events.at(-1),{type:"icon.pickup.request",payload:{cityId:0,itemType:12,amount:1}});
    state.hazards.set("mine",{id:"mine",cityId:0,type:4,x:state.local.x,y:state.local.y,radius:24,armed:true});
    assert.equal(createThreeGameActions(state,send).collect(),4);
    state.hazards.get("mine")!.cityId=1;state.local.x+=25;
    assert.equal(createThreeGameActions(state,send).collect(),null);
});

test("inventory arming is preserved in the subsequent under-tank bomb drop",()=>{
    const state=createClientState(),events:Array<{type:string;payload:unknown}>=[];state.local.id="pilot";state.debug.socketConnected=true;state.local.x=480;state.local.y=480;state.inventory.set(3,2);
    const send:EventSender=(type,payload)=>events.push({type,payload});state.ui.bombArmed=true;
    assert.equal(createThreeGameActions(state,send).deploy(3),true);
    assert.deepEqual(events.at(-1),{type:"hazard.deploy.request",payload:{cityId:state.local.city,type:3,position:{x:480,y:480,tileX:10,tileY:10},armed:true}});
    state.ui.bombArmed=false;assert.equal(createThreeGameActions(state,send).deploy(3),true);
    assert.equal((events.at(-1)!.payload as {armed:boolean}).armed,false);
});

test("pending movement reaches the server before the precise under-tank drop",()=>{
    const state=createClientState(),events:string[]=[];
    Object.assign(state.local,{id:"pilot",x:480,y:480});state.debug.socketConnected=true;state.inventory.set(3,1);
    const send:EventSender=type=>events.push(type);
    const actions=createThreeGameActions(state,send,()=>events.push("player.update"));
    assert.equal(actions.deploy(3),true);
    assert.deepEqual(events,["player.update","hazard.deploy.request"]);
});
