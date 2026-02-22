import { makeEnvelope, type KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeState } from "./types.js";

type EnvelopeType = keyof KnownEventPayloadByType;

export type Broadcaster = {
    emitAll: (event: ReturnType<typeof makeEnvelope>) => void;
    emitTo: (socketId: string, event: ReturnType<typeof makeEnvelope>) => void;
    reject: (socketId: string, reason: string) => void;
};

export type RuntimeEmitter = {
    emit: <TType extends EnvelopeType>(type: TType, payload: KnownEventPayloadByType[TType]) => void;
    emitTo: <TType extends EnvelopeType>(
        socketId: string,
        type: TType,
        payload: KnownEventPayloadByType[TType]
    ) => void;
};

const nextSeq = (state: RuntimeState): number => {
    state.seq += 1;
    return state.seq;
};

export const createRuntimeEmitter = (state: RuntimeState, broadcaster: Broadcaster): RuntimeEmitter => {
    return {
        emit: (type, payload) => {
            broadcaster.emitAll(makeEnvelope(type, nextSeq(state), payload));
        },
        emitTo: (socketId, type, payload) => {
            broadcaster.emitTo(socketId, makeEnvelope(type, nextSeq(state), payload));
        }
    };
};
