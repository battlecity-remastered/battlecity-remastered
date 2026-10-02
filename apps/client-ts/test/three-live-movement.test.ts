import test from "node:test";
import assert from "node:assert/strict";
import {createClientState,updateFromSnapshot} from "../src/app/state.js";

test("stopping uses the last authoritative position without extrapolating old movement",()=>{
    const state=createClientState();state.local.id="pilot";state.local.x=0;state.local.y=0;const now=Date.now();
    state.render.authoritativeSnapshots.push({serverTime:now-200,x:1000,y:0,direction:8});
    updateFromSnapshot(state,{serverTime:now-100,players:[{id:"pilot",city:0,direction:8,offset:{x:1100,y:0}}]});
    assert.equal(state.local.x,1100);assert.equal(state.local.y,0);
});
