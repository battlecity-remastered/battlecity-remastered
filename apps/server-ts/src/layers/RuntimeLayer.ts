import { Context, Effect, Layer } from "effect";
import { GameRuntime } from "../runtime/GameRuntime.js";
import { RuntimeScope } from "../runtime/RuntimeScope.js";
import type { Broadcaster } from "../runtime/emitter.js";
import { DEFAULT_RUNTIME_CONFIG, type RuntimeConfig } from "../runtime/types.js";

export type RuntimeServices = {
    runtime: GameRuntime;
    runtimeScope: RuntimeScope;
};

export const RuntimeServicesTag = Context.GenericTag<RuntimeServices>("@battlecity/server-ts/RuntimeServices");

export const makeRuntimeServices = (
    broadcaster: Broadcaster,
    config: Partial<RuntimeConfig> = {}
): RuntimeServices => {
    const resolvedConfig = { ...DEFAULT_RUNTIME_CONFIG, ...config };
    const runtime = new GameRuntime(broadcaster, resolvedConfig);
    const runtimeScope = RuntimeScope.open(runtime, resolvedConfig);
    return { runtime, runtimeScope };
};

export const RuntimeLayer = (
    broadcaster: Broadcaster,
    config: Partial<RuntimeConfig> = {}
): Layer.Layer<RuntimeServices> => {
    return Layer.sync(RuntimeServicesTag, () => makeRuntimeServices(broadcaster, config));
};

export const buildRuntimeServices = (
    broadcaster: Broadcaster,
    config: Partial<RuntimeConfig> = {}
): RuntimeServices => {
    return Effect.runSync(Effect.gen(function* () {
        const services = yield* RuntimeServicesTag.pipe(Effect.provide(RuntimeLayer(broadcaster, config)));
        return services;
    }));
};
