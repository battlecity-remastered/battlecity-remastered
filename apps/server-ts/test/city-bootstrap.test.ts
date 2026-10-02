import test from "node:test";
import assert from "node:assert/strict";
import { makeEnvelope } from "@battlecity/protocol";
import { GameRuntime } from "../src/runtime/GameRuntime.js";
import { createRuntimeState,DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { initializeJoinedPlayer,seedCommandCenter } from "../src/domain/spawn/CityBootstrap.js";

test("map-backed joins create an authoritative spawn and command centre; leaving removes the player",()=>{
    const state=createRuntimeState();seedCommandCenter(state,0,DEFAULT_RUNTIME_CONFIG);seedCommandCenter(state,0,DEFAULT_RUNTIME_CONFIG);assert.equal(state.buildings.size,1);
    const rejected:string[]=[];const runtime=new GameRuntime({emitAll:()=>{},emitTo:()=>{},reject:(_socket,reason)=>rejected.push(reason)},{},state,{initializeJoinedPlayer});
    runtime.handleRawEvent("pilot",makeEnvelope("lobby.join.request",1,{desiredCity:0,callsign:"Pilot"}));
    assert.equal(state.players.get("pilot")!.x,1529.5);assert.equal(state.players.get("pilot")!.y,1578.5);
    runtime.handleRawEvent("pilot",makeEnvelope("player.update",2,{id:"pilot",city:0,direction:0,isMoving:false,offset:{x:1,y:1}}));assert.equal(state.players.get("pilot")!.x,1529.5);assert.deepEqual(rejected,["ValidationFailed"]);
    runtime.handleRawEvent("pilot",makeEnvelope("lobby.leave.request",3,{}));assert.equal(state.players.has("pilot"),false);assert.equal(state.socketCities.has("pilot"),false);
});

test("map-backed city progresses from housing through research and production to armed combat",async()=>{
    const {loadBlockingTiles,loadPlacementBlockingTiles}=await import("../src/domain/map/MapService.js");
    const state=createRuntimeState({blockingTiles:loadBlockingTiles(),buildBlockingTiles:loadPlacementBlockingTiles()});
    const config={...DEFAULT_RUNTIME_CONFIG,rogueMaxBots:0};seedCommandCenter(state,0,config);seedCommandCenter(state,1,config);
    const rejected:string[]=[];const events:Array<{type:string;payload:unknown}>=[];
    const runtime=new GameRuntime({emitAll:event=>events.push(event),emitTo:(_socket,event)=>events.push(event),reject:(_socket,reason)=>rejected.push(reason)},config,state,{initializeJoinedPlayer});
    let seq=0;runtime.handleRawEvent("mayor",makeEnvelope("lobby.join.request",++seq,{desiredCity:0}));
    const place=(type:number,tileX:number,tileY:number):void=>runtime.handleRawEvent("mayor",makeEnvelope("building.place.request",++seq,{ownerId:"mayor",cityId:0,type,tileX,tileY}));
    place(300,26,31);place(300,21,31);place(412,30,24);
    for(let tick=0;tick<150;tick++)runtime.tickBullets();
    assert.ok(state.research.get(0)?.completed.includes(412),"staffed laser lab completes research");
    place(112,26,26);for(let tick=0;tick<150;tick++)runtime.tickBullets();
    assert.ok((state.factoryStock.get(0)?.get(12)??0)>0,"staffed factory produces lasers");
    const pilot=state.players.get("mayor")!;pilot.x=26*48+56;pilot.y=26*48+102;
    runtime.handleRawEvent("mayor",makeEnvelope("icon.pickup.request",++seq,{cityId:0,itemType:12,amount:1}));
    assert.equal(state.playerInventory.get("mayor")?.get(12),1);
    runtime.handleRawEvent("enemy",makeEnvelope("lobby.join.request",1,{desiredCity:1}));
    const enemy=state.players.get("enemy")!;enemy.x=pilot.x+100;enemy.y=pilot.y;
    runtime.handleRawEvent("mayor",makeEnvelope("bullet.fire.request",++seq,{ownerId:"mayor",position:{x:pilot.x+48,y:pilot.y+24},direction:0,type:0}));
    for(let tick=0;tick<3;tick++)runtime.tickBullets();assert.ok(state.players.get("enemy")!.health<100,"authoritative bullet damages enemy");
    assert.ok(events.some(event=>event.type==="bullet.fired"&&(event.payload as {speed:number}).speed===config.bulletSpeed));
    assert.deepEqual(rejected,[]);
});

test("repeated joins preserve health and role; a departing mayor promotes a recruit",()=>{
    const state=createRuntimeState(),runtime=new GameRuntime({emitAll:()=>{},emitTo:()=>{},reject:(_socket,reason)=>assert.fail(reason)},{},state,{initializeJoinedPlayer});
    runtime.handleRawEvent("mayor",makeEnvelope("lobby.join.request",1,{desiredCity:0}));state.players.get("mayor")!.health=42;
    runtime.handleRawEvent("mayor",makeEnvelope("lobby.join.request",2,{desiredCity:0}));assert.equal(state.players.get("mayor")!.health,42);assert.equal(state.socketRoles.get("mayor"),"mayor");
    runtime.handleRawEvent("recruit",makeEnvelope("lobby.join.request",1,{desiredCity:0}));runtime.handleRawEvent("mayor",makeEnvelope("lobby.leave.request",3,{}));assert.equal(state.socketRoles.get("recruit"),"mayor");
});

test("a mayor can rebuild the command centre on its reserved map site after destruction",async()=>{
    const {loadBlockingTiles,loadPlacementBlockingTiles}=await import("../src/domain/map/MapService.js");const state=createRuntimeState({blockingTiles:loadBlockingTiles(),buildBlockingTiles:loadPlacementBlockingTiles()});
    const runtime=new GameRuntime({emitAll:()=>{},emitTo:()=>{},reject:(_id,reason)=>assert.fail(reason)},{},state,{initializeJoinedPlayer});runtime.handleRawEvent("mayor",makeEnvelope("lobby.join.request",1,{desiredCity:0}));
    runtime.handleRawEvent("mayor",makeEnvelope("building.demolish.request",2,{id:"command_center_0",cityId:0}));assert.equal(state.buildings.size,0);
    runtime.handleRawEvent("mayor",makeEnvelope("building.place.request",3,{ownerId:"mayor",cityId:0,type:0,tileX:31,tileY:31}));assert.ok([...state.buildings.values()].some(building=>building.type===0&&building.tileX===31&&building.tileY===31));
});

test("cloak prevents automatic defense targeting until its field expires",async()=>{
    const {useItem}=await import("../src/domain/items/ItemUseService.js"),{tickDefenseTurrets}=await import("../src/domain/defense/DefenseTurretService.js"),{createRuntimeEmitter}=await import("../src/runtime/emitter.js");
    const state=createRuntimeState();state.players.set("pilot",{id:"pilot",city:1,x:1030,y:960,direction:0,speed:600,health:50,maxHealth:100});state.playerInventory.set("pilot",new Map([[0,1]]));
    assert.equal(useItem(state,"pilot",{itemType:0}).ok,true);assert.equal(state.players.get("pilot")!.health,50);assert.ok(state.players.get("pilot")!.cloakedUntil!>Date.now());
    state.defenses.set("turret",{id:"turret",cityId:0,type:9,tileX:20,tileY:20,health:100,maxHealth:100});const emitter=createRuntimeEmitter(state,{emitAll:()=>{},emitTo:()=>{},reject:()=>{}});
    tickDefenseTurrets(state,DEFAULT_RUNTIME_CONFIG,emitter,Date.now());assert.equal(state.bullets.size,0);state.players.get("pilot")!.cloakedUntil=Date.now()-1;tickDefenseTurrets(state,DEFAULT_RUNTIME_CONFIG,emitter,Date.now());assert.equal(state.bullets.size,1);
});
