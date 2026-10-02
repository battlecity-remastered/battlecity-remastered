import { normalizeHeading32 } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";
import { TURN_SPEED_STEPS_PER_SECOND } from "./intents.js";
import { createPlayerCollisionWorld, moveLocalPlayer } from "../gameplay/player-movement.js";
import { captureLocalSimulationBase } from "./render-timing.js";
import { recordDebugUpdateTick } from "./debug-metrics.js";

// The offline renderer and movement share one clock. Small collision steps
// preserve the classic speed/footprint without the old 30 Hz visual staircase.
export const createDemoMovement = (state: ClientState) => {
    let lastFrame: number | null=null,stopped=false;
    return {
        advanceFrame: (nowMs: number,wallNowMs=Date.now()): void => {
            if(stopped || !Number.isFinite(nowMs))return;
            const elapsed=lastFrame===null?0:Math.max(0,Math.min(100,nowMs-lastFrame));
            lastFrame=lastFrame===null?nowMs:Math.max(nowMs,lastFrame);
            captureLocalSimulationBase(state);
            state.render.projectedOffsetX=state.render.projectedOffsetY=0;
            state.render.lastResolvedAt=wallNowMs;
            recordDebugUpdateTick(state,wallNowMs);
            if(!state.local.id || elapsed<=0)return;
            const turn=Number(state.controls.turnRight)-Number(state.controls.turnLeft);
            const throttle=Number(state.controls.moveForward)-Number(state.controls.moveBackward);
            const world=throttle?createPlayerCollisionWorld(state):undefined;
            const maxStep=Math.min(8,12000/Math.max(1,Math.abs(state.local.speed)));
            const steps=Math.ceil(elapsed/maxStep),dt=elapsed/steps;
            for(let i=0;i<steps;i++) {
                const delta=turn*TURN_SPEED_STEPS_PER_SECOND*dt/1000;
                const midpoint=normalizeHeading32(state.local.direction+delta*0.5);
                state.local.direction=normalizeHeading32(state.local.direction+delta);
                if(throttle)moveLocalPlayer(state,midpoint,throttle,dt,world);
            }
        },
        resetClock: (): void => {lastFrame=null;},
        stop: (): void => {stopped=true;}
    };
};
