import { Effect, Ref } from "effect";
import { createRuntimeState, type RuntimeState } from "../types.js";

export type RuntimeStateRef = Ref.Ref<RuntimeState>;

export const createRuntimeStateRef = (initialState: RuntimeState = createRuntimeState()): RuntimeStateRef => {
    return Effect.runSync(Ref.make(initialState));
};

export const readRuntimeState = (stateRef: RuntimeStateRef): RuntimeState => {
    return Effect.runSync(Ref.get(stateRef));
};
