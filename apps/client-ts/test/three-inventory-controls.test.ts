import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createThreeInventoryControls } from "../src/input/three-inventory-controls.js";

const key=(key:string,extra:Partial<KeyboardEvent>={})=>({key,repeat:false,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,...extra}) as KeyboardEvent;
const setup=()=>{
    const state=createClientState();state.local.id="pilot";state.inventory.set(3,2);state.inventory.set(5,1);state.ui.selectedInventoryItemType=3;
    const calls:unknown[]=[];
    const controls=createThreeInventoryControls(()=>state,{cycle:direction=>calls.push(direction),drop:()=>calls.push(["drop",state.ui.selectedInventoryItemType,state.ui.bombArmed]),use:type=>calls.push(["use",type]),changed:()=>calls.push("changed")});
    return {state,calls,controls};
};
test("U collects on press and retries while held, without browser repeats doubling requests",()=>{
    const {controls}=setup();assert.ok(controls.keyDown(key("u")));
    assert.ok(controls.collectRequested(0));assert.equal(controls.collectRequested(799),false);
    controls.keyDown(key("u",{repeat:true}));assert.equal(controls.collectRequested(799),false);
    assert.ok(controls.collectRequested(800));controls.keyUp(key("U"));assert.equal(controls.collectRequested(1600),false);
    controls.requestCollect();assert.ok(controls.collectRequested(1601));assert.equal(controls.collectRequested(2401),false);
    controls.keyDown(key("u"));controls.reset();assert.equal(controls.collectRequested(3000),false);
});
test("classic D/Shift+X/Shift+H drops, B armed bomb, V arm toggle, and O orb keep their meanings",()=>{
    const {state,calls,controls}=setup();
    for(const event of [key("d"),key("g"),key("x",{shiftKey:true}),key("h",{shiftKey:true})])assert.ok(controls.keyDown(event));
    assert.equal(calls.length,4);assert.ok(controls.keyDown(key("v")));assert.equal(state.ui.bombArmed,true);
    assert.ok(controls.keyDown(key("v")));assert.equal(state.ui.bombArmed,false);
    assert.ok(controls.keyDown(key("b")));assert.deepEqual(calls.at(-1),["drop",3,true]);
    const count=calls.length;controls.keyDown(key("b",{repeat:true}));assert.equal(calls.length,count);
    assert.ok(controls.keyDown(key("o")));assert.deepEqual(calls.at(-1),["drop",5,false]);
    assert.equal(controls.keyDown(key("o",{shiftKey:true})),false);
});
test("chat typing and browser/build modifiers do not deploy cargo or latch pickup",()=>{
    const {controls,calls}=setup();
    assert.equal(controls.keyDown(key("u",{target:{tagName:"INPUT"} as unknown as EventTarget})),false);
    assert.equal(controls.keyDown(key("b",{ctrlKey:true})),false);
    assert.equal(controls.keyDown(key("d",{metaKey:true})),false);
    assert.equal(controls.collectRequested(0),false);assert.equal(calls.length,0);
    controls.keyDown(key("c"));controls.keyDown(key("h"));assert.deepEqual(calls,[["use",0],["use",2]]);
});
