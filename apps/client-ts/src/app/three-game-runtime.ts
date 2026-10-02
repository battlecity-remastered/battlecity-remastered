import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { createDemoMovement } from "./demo-movement.js";
import { stepClientBullets } from "../gameplay/bullets/BulletClientService.js";

// Rendering owns local prediction; a separate 20 Hz channel sends the latest
// input/position without making driving wait for network or server snapshots.
export const createThreeGameRuntime = (state: ClientState, send: EventSender) => {
    const movement = createDemoMovement(state);
    let lastFrame: number | null = null;
    const sendMovement = (): void => {
        if (!state.local.id || !state.debug.socketConnected || state.local.health <= 0) return;
        const throttle = document.hidden ? 0 : Number(state.controls.moveForward) - Number(state.controls.moveBackward);
        send("player.update", {
            id: state.local.id, city: state.local.city, direction: state.local.direction,
            isMoving: throttle !== 0, throttle, offset: { x: state.local.x, y: state.local.y }
        });
    };
    const timer = window.setInterval(sendMovement, 50);
    const inputChanged=(event:Event):void=>{if(event instanceof KeyboardEvent && (event.repeat || !["KeyW","KeyA","KeyS","KeyD","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(event.code)))return;sendMovement();};
    window.addEventListener("keydown",inputChanged);window.addEventListener("keyup",inputChanged);window.addEventListener("blur",inputChanged);
    const reset = (): void => { movement.resetClock(); lastFrame = null; if(document.hidden){state.controls.moveForward=state.controls.moveBackward=state.controls.shoot=false;sendMovement();} };
    document.addEventListener("visibilitychange", reset);
    return {
        advanceFrame(now: number): void {
            const dt = lastFrame === null ? 0 : Math.max(0, Math.min(100, now - lastFrame));
            lastFrame = now;
            if (state.debug.socketConnected && state.local.health > 0 && (state.local.frozenUntil??0)<=Date.now()) movement.advanceFrame(now);
            else movement.resetClock();
            stepClientBullets(state, dt);
        },
        sendMovement,
        stop(): void { window.clearInterval(timer); movement.stop();window.removeEventListener("keydown",inputChanged);window.removeEventListener("keyup",inputChanged);window.removeEventListener("blur",inputChanged); document.removeEventListener("visibilitychange", reset); }
    };
};
