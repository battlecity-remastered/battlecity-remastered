import { Effect } from "effect";
import type { ClientState } from "./state.js";
import type { EventSender } from "../network/events.js";
import { buildTickIntents } from "./intents.js";

const TICK_MS = 100;

export const startGameLoop = (state: ClientState, send: EventSender): void => {
    setInterval(() => {
        const intents = buildTickIntents(state, Date.now());
        Effect.runSync(Effect.forEach(intents, (intent) => {
            return Effect.sync(() => {
                send(intent.type, intent.payload);
            });
        }));
    }, TICK_MS);
};
