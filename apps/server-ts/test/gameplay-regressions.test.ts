import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeState, DEFAULT_RUNTIME_CONFIG } from "../src/runtime/types.js";
import { createRuntimeEmitter } from "../src/runtime/emitter.js";
import { tickBullets } from "../src/runtime/bullet-runtime.js";
import { hasBotTerrainSight } from "../src/domain/bots/BotShared.js";

for (const [city, defenseShot, expected] of [[17, true, 100], [0, true, 95], [17, false, 95]] as const) {
    test(`factory hit: city=${city}, defense=${defenseShot} preserves intended friendly-fire rules`, () => {
        const state = createRuntimeState();
        const emitter = createRuntimeEmitter(state, {emitAll:()=>{},emitTo:()=>{},reject:()=>{}});
        state.buildings.set("factory",{id:"factory",ownerId:"owner",cityId:17,type:100,tileX:10,tileY:10,health:100,maxHealth:100,population:0});
        state.bullets.set("shot",{id:"shot",ownerId:"turret",city,isDefenseShot:defenseShot,x:478,y:504,direction:0,speed:800,type:0,remainingRange:260});
        tickBullets(state,DEFAULT_RUNTIME_CONFIG,emitter);
        assert.equal(state.buildings.get("factory")!.health,expected);
        assert.equal(state.bullets.size,0,"friendly structures still stop turret shots");
    });
}

test("laser hits an enemy defender across lava, while rocks still block bot sight", () => {
    const state=createRuntimeState({blockingTiles:new Set(["10,10"]),bulletBlockingTiles:new Set()});
    const emitter=createRuntimeEmitter(state,{emitAll:()=>{},emitTo:()=>{},reject:()=>{}});
    const defender={id:"defender",city:17,x:528,y:480,direction:0,speed:220,health:20,maxHealth:20,isBot:true,botType:"defender" as const};
    state.players.set(defender.id,defender);
    state.bullets.set("shot",{id:"shot",ownerId:"human",city:0,x:500,y:504,direction:0,speed:800,type:0,remainingRange:260});
    tickBullets(state,DEFAULT_RUNTIME_CONFIG,emitter);
    assert.equal(state.players.get(defender.id)!.health,15);
    const shooter={...defender,x:432};
    assert.equal(hasBotTerrainSight(state,DEFAULT_RUNTIME_CONFIG,shooter,defender),true);
    state.bulletBlockingTiles.add("10,10");
    assert.equal(hasBotTerrainSight(state,DEFAULT_RUNTIME_CONFIG,shooter,defender),false);
});
