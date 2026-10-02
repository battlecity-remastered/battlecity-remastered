import { Effect } from "effect";
import { isThreeDemoMode, type ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { buildTickPlan } from "./intents.js";
import { moveLocalPlayer } from "../gameplay/player-movement.js";
import { stepClientBullets } from "../gameplay/bullets/BulletClientService.js";
import { recordDebugUpdateTick } from "./debug-metrics.js";
import { captureLocalSimulationBase, CLIENT_SIMULATION_STEP_MS } from "./render-timing.js";
import { createDemoMovement } from "./demo-movement.js";

const TICK_MS = CLIENT_SIMULATION_STEP_MS;

export type LoopRuntime = {
    stop: () => void;
    advanceFrame?: (nowMs: number) => void;
};

export const startGameLoop = (state: ClientState, send: EventSender): LoopRuntime => {
    if(isThreeDemoMode()) {
        const movement=createDemoMovement(state);
        const reset=(): void => {movement.resetClock();};
        document.addEventListener("visibilitychange",reset);
        return {advanceFrame:movement.advanceFrame,stop:()=>{movement.stop();document.removeEventListener("visibilitychange",reset);}};
    }
    const timer = window.setInterval(() => {
        const now = Date.now();
        recordDebugUpdateTick(state, now);
        const dtMs = TICK_MS;
        captureLocalSimulationBase(state);

        const plan = buildTickPlan(state, now, dtMs);
        if (plan.isMoving && state.local.id) {
            moveLocalPlayer(state, plan.direction, plan.throttle, dtMs);
        }
        stepClientBullets(state, dtMs);

        Effect.runSync(
            Effect.forEach(plan.intents, (intent) => {
                return Effect.sync(() => {
                    send(intent.type, intent.payload);
                });
            }, { discard: true })
        );
    }, TICK_MS);

    return {
        stop: () => {
            window.clearInterval(timer);
        }
    };
};
