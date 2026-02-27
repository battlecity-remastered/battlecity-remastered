import type { KnownEventPayloadByType, KnownTypedEventEnvelope } from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { handlers } from "./network-event-handlers.js";

export const APPLIED_SERVER_EVENT_TYPES = Object.freeze(
    Object.keys(handlers) as Array<keyof KnownEventPayloadByType>
);

export const hasServerEventHandler = (type: keyof KnownEventPayloadByType): boolean => {
    return type in handlers;
};

export const applyServerEvent = (state: ClientState, event: KnownTypedEventEnvelope): void => {
    const handler = handlers[event.type];
    if (handler) {
        handler(state, event.payload as never);
    }
};
