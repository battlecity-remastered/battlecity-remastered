import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { INVENTORY_ITEMS, INVENTORY_ORDER, seedDemoInventory, selectInventoryItem, clickInventoryItem, selectedWeapon, transferInventoryItem } from "../src/render/three/inventory-model.js";
import { createDemoCombat, WEAPON_PROFILES } from "../src/render/three/demo-combat.js";
import { buildTickPlan } from "../src/app/intents.js";

test("demo cargo uses every original DX item ID, preserves existing inventory and rejects empty selection",()=>{
    const state=createClientState();seedDemoInventory(state);
    assert.equal(new Set(INVENTORY_ORDER).size,13);
    assert.deepEqual(INVENTORY_ITEMS.map(item=>item.type),Array.from({length:13},(_,i)=>i));
    assert.equal(state.ui.selectedInventoryItemType,5);
    assert.equal(selectedWeapon(1),"rocket");assert.equal(selectedWeapon(12),"laser");assert.equal(selectedWeapon(5),undefined);
    assert.ok(selectInventoryItem(state,1));
    for(let i=0;i<8;i++)assert.ok(transferInventoryItem(state.inventory,1,-1));
    assert.equal(transferInventoryItem(state.inventory,1,-1),false);
    assert.equal(selectInventoryItem(state,1),false);
    assert.equal(transferInventoryItem(state.inventory,999,1),false);
    seedDemoInventory(state);assert.equal(state.inventory.get(1),0,"a render must not refill dropped cargo");
    assert.ok(transferInventoryItem(state.inventory,1,1));assert.equal(state.inventory.get(1),1);
});

test("equipped weapons keep independent flight profiles; switching cannot transform rounds already flying",()=>{
    const combat=createDemoCombat(()=>undefined),muzzle={x:0,y:1,z:0};
    combat.step(0,true,muzzle,0,0,"rocket");
    combat.step(0.1,true,muzzle,0,1,"laser");
    combat.launch({x:2,y:1,z:0},{x:0,y:0,z:-1});
    const [rocket,laser,turret]=combat.shells;
    assert.equal(rocket!.weapon,"rocket");assert.equal(laser!.weapon,"laser");assert.equal(turret!.weapon,"cannon");
    assert.equal(rocket!.velocity.z,-WEAPON_PROFILES.rocket.speed);
    for(let i=0;i<10;i++)combat.step(0.1,false,muzzle,0,1.1+i*0.1,"cannon");
    assert.ok(rocket!.position.y<1);assert.equal(laser!.position.y,1);
    assert.ok(laser!.position.z<rocket!.position.z*2);
    assert.ok(Math.abs(turret!.position.z+24)<1e-8);
});

test("fast laser pulses still sweep thin cover and report energy impacts",()=>{
    const combat=createDemoCombat((from,to)=>from.z>-0.01&&to.z<=-0.01?{point:{x:0,y:1,z:-0.01},normal:{x:0,y:0,z:1},surface:"metal"}:undefined);
    combat.step(0,true,{x:0,y:1,z:0},0,0,"laser");
    const events=combat.step(0.1,false,{x:0,y:1,z:0},0,0.1,"laser");
    assert.equal(events.impacts.length,1);assert.equal(events.impacts[0]!.weapon,"laser");assert.equal(combat.shells.length,0);
});

test("offline stocked inventory does not duplicate local shots through legacy network intents or audio",()=>{
    const oldWindow=globalThis.window;
    try {
        globalThis.window={location:{search:"?demo=1"}} as Window & typeof globalThis;
        const state=createClientState();seedDemoInventory(state);state.controls.shoot=true;
        const plan=buildTickPlan(state,10000,16);
        assert.equal(plan.intents.filter(intent=>intent.type==="bullet.fire.request").length,0);
        assert.equal(plan.shouldShoot,false);assert.equal(state.local.lastShotAt,0);
    } finally {if(oldWindow===undefined)delete (globalThis as {window?:Window}).window;else globalThis.window=oldWindow;}
});

test("clicking the selected bomb toggles arming; switching cargo clears it",()=>{
    const state=createClientState();seedDemoInventory(state);
    assert.ok(clickInventoryItem(state,3));assert.equal(state.ui.bombArmed,false);
    assert.ok(clickInventoryItem(state,3));assert.equal(state.ui.bombArmed,true);
    assert.ok(clickInventoryItem(state,3));assert.equal(state.ui.bombArmed,false);
    clickInventoryItem(state,3);assert.equal(state.ui.bombArmed,true);
    clickInventoryItem(state,4);assert.equal(state.ui.bombArmed,false);
});
