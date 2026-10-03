import assert from "node:assert/strict";
import test from "node:test";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { tickRogueBots } from "../src/domain/bots/RogueBotService.js";
import { rogueSpawnRadii, rogueWaveSize } from "../src/domain/bots/rogue-spawn-rules.js";
import { resolveCityCenter } from "../src/domain/bots/BotShared.js";

test("rogue waves give sixty to one hundred twenty seconds respite after the last kill", context => {
    context.mock.method(Math, "random", () => .5);
    const state = createRuntimeState(), config = {...DEFAULT_RUNTIME_CONFIG, rogueMaxBots: 2, rogueBuildingThreshold: 0};
    const emitter = createRuntimeEmitter(state, { emitAll: () => {}, emitTo: () => {}, reject: () => {} });
    const center = resolveCityCenter(0, config);
    state.players.set("human", {id:"human",city:0,x:center.x,y:center.y,direction:0,speed:0,health:40,maxHealth:40});
    state.socketCities.set("human",0);
    tickRogueBots(state,config,emitter,1000,0); assert.equal(state.botControllers.size,1);
    tickRogueBots(state,config,emitter,10000,0); assert.equal(state.botControllers.size,1);
    const id=[...state.botControllers.keys()][0]!; state.botControllers.delete(id); state.players.delete(id);
    tickRogueBots(state,config,emitter,11000,0); assert.equal(state.rogueNextWaveAt,101000);
    tickRogueBots(state,config,emitter,100999,0); assert.equal(state.botControllers.size,0);
    tickRogueBots(state,config,emitter,101000,0); assert.equal(state.botControllers.size,1);
});

test("spawn clearance follows the full city footprint and wave size follows city scale", () => {
    const state=createRuntimeState(), config={...DEFAULT_RUNTIME_CONFIG,rogueMaxBots:2}, center=resolveCityCenter(0,config);
    assert.equal(rogueSpawnRadii(state,config,0).min,27*48);
    for(let i=0;i<32;i++)state.buildings.set(`building-${i}`,{id:`building-${i}`,ownerId:"human",cityId:0,type:300,tileX:Math.floor(center.x/48)+20,tileY:Math.floor(center.y/48),health:100,maxHealth:100,population:0});
    assert.ok(rogueSpawnRadii(state,config,0).min>40*48);
    assert.equal(rogueWaveSize(state,config,0),2);
    state.buildings.delete("building-0"); assert.equal(rogueWaveSize(state,config,0),1);
});
