import { Effect } from "effect";
import { advancePlayer } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { buildTickPlan } from "./intents.js";

const TICK_MS = 100;
const MAP_MAX = 24576;

export type LoopRuntime = {
    stop: () => void;
};

export const startGameLoop = (state: ClientState, send: EventSender): LoopRuntime => {
    let lastTickAt = Date.now();

    const timer = window.setInterval(() => {
        const now = Date.now();
        const dtMs = Math.max(1, now - lastTickAt);
        lastTickAt = now;

        const plan = buildTickPlan(state, now, dtMs);
        if (plan.isMoving && state.local.id) {
            const moved = advancePlayer({
                id: state.local.id,
                x: state.local.x,
                y: state.local.y,
                direction: plan.direction,
                speed: state.local.speed
            }, dtMs, MAP_MAX, MAP_MAX);
            state.local.x = moved.x;
            state.local.y = moved.y;
        }

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
