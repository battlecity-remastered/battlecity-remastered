import { Effect } from "effect";

export type RuntimeLogLevel = "debug" | "info" | "warn" | "error";

type LogMeta = Record<string, unknown>;

const writeLog = (level: RuntimeLogLevel, message: string, meta?: LogMeta): void => {
    const payload = {
        ts: new Date().toISOString(),
        level,
        message,
        meta: meta ?? {}
    };
    const line = JSON.stringify(payload);
    if (level === "error") {
        console.error(line);
        return;
    }
    if (level === "warn") {
        console.warn(line);
        return;
    }
    console.log(line);
};

export const logRuntime = (level: RuntimeLogLevel, message: string, meta?: LogMeta): Effect.Effect<void> => {
    return Effect.sync(() => {
        writeLog(level, message, meta);
    });
};
