import { Effect } from "effect";
import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { buildTickPlan } from "./intents.js";
import { moveLocalPlayer } from "../gameplay/player-movement.js";
import { stepClientBullets } from "../gameplay/bullets/BulletClientService.js";
import { recordDebugUpdateTick } from "./debug-metrics.js";
import { captureLocalSimulationBase, CLIENT_SIMULATION_STEP_MS } from "./render-timing.js";

const TICK_MS = CLIENT_SIMULATION_STEP_MS;

export type LoopRuntime = {
    stop: () => void;
};

export const startGameLoop = (state: ClientState, send: EventSender): LoopRuntime => {
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
