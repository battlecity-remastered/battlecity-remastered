import { Effect } from "effect";

type ClientLogMeta = Record<string, unknown>;

export const logClient = (message: string, meta?: ClientLogMeta): Effect.Effect<void> => {
    return Effect.sync(() => {
        console.log(JSON.stringify({
            ts: new Date().toISOString(),
            source: "client-ts",
            message,
            meta: meta ?? {}
        }));
    });
};
