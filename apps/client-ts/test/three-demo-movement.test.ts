import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { createDemoMovement } from "../src/app/demo-movement.js";
import { moveLocalPlayer } from "../src/gameplay/player-movement.js";
import { captureLocalSimulationBase,resolveLocalRenderPosition } from "../src/app/render-timing.js";

const movingState=()=>{const state=createClientState();state.local.id="demo";state.local.x=state.local.y=10000;state.controls.moveForward=true;return state;};
const deviation=(values: number[])=>{const mean=values.reduce((a,b)=>a+b,0)/values.length;return Math.sqrt(values.reduce((sum,n)=>sum+(n-mean)**2,0)/values.length);};

test("actual frame movement eliminates the 30 Hz rendered-position staircase",t=>{
    const old=movingState(),current=movingState(),movement=createDemoMovement(current);
    movement.advanceFrame(0,0);
    let tick=0,oldPosition=old.local.y,position=current.local.y;
    const oldDeltas:number[]=[],deltas:number[]=[];
    for(let frame=1;frame<=180;frame++) {
        const now=frame*1000/60;
        while(now-tick>=33){captureLocalSimulationBase(old);moveLocalPlayer(old,0,1,33);tick+=33;old.debug.loop.lastUpdateAt=tick;}
        const rendered=resolveLocalRenderPosition(old,now);
        movement.advanceFrame(now,now);
        if(frame>30){oldDeltas.push(rendered.y-oldPosition);deltas.push(current.local.y-position);}
        oldPosition=rendered.y;position=current.local.y;
    }
    const before=deviation(oldDeltas),after=deviation(deltas);
    t.diagnostic(`60 FPS motion-step deviation: old ${before.toFixed(3)} px, frame clock ${after.toFixed(6)} px`);
    assert.ok(before>1);assert.ok(after<1e-6);
    assert.ok(Math.abs(current.local.y-8200)<1e-6,"classic 600 px/s speed is retained");
});

test("distance, reverse and continuous steering remain consistent at 30, 60 and 144 FPS",()=>{
    const positions=[];
    for(const fps of [30,60,144]) {
        const state=movingState(),movement=createDemoMovement(state);movement.advanceFrame(0,0);
        for(let i=1;i<=fps;i++)movement.advanceFrame(i*1000/fps,i*1000/fps);
        assert.ok(Math.abs(state.local.y-9400)<1e-6);
        state.controls.moveForward=false;state.controls.moveBackward=true;state.controls.turnRight=true;
        for(let i=1;i<=fps;i++)movement.advanceFrame(1000+i*1000/fps,1000+i*1000/fps);
        assert.ok(Math.abs(state.local.direction-12)<1e-8);
        positions.push({x:state.local.x,y:state.local.y});
    }
    for(const pos of positions)assert.ok(Math.hypot(pos.x-positions[0]!.x,pos.y-positions[0]!.y)<0.01);
});

test("frame substeps preserve collision, apron travel and background-resume behavior",()=>{
    const state=movingState();state.local.x=48*20;state.local.y=48*20;state.local.direction=8;
    state.world.blockingTiles.add("22,20");
    const movement=createDemoMovement(state);movement.advanceFrame(0,0);
    for(let i=1;i<=20;i++)movement.advanceFrame(i*100,i*100);
    assert.ok(state.local.x+24+12<22*48,"the tank cannot tunnel through a blocked tile");
    state.controls.moveForward=false;state.controls.turnRight=true;
    movement.advanceFrame(2100,2100);const heading=state.local.direction;
    movement.resetClock();movement.advanceFrame(20000,20000);assert.equal(state.local.direction,heading);
    movement.advanceFrame(20010,20010);assert.ok(state.local.direction>heading);
    movement.stop();const stopped=state.local.direction;movement.advanceFrame(20020,20020);assert.equal(state.local.direction,stopped);

    const apron=movingState();apron.local.x=48*20;apron.local.y=48*22;apron.local.direction=8;
    for(let x=20;x<23;x++)for(let y=20;y<22;y++)apron.world.blockingTiles.add(`${x},${y}`);
    const drive=createDemoMovement(apron);drive.advanceFrame(0,0);drive.advanceFrame(100,100);
    assert.ok(apron.local.x>48*20,"the command-center apron remains driveable");
});
