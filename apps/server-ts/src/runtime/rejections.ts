import type { Broadcaster } from "./emitter.js";
import type { RuntimeRejectReason } from "./types.js";
import { toDomainError } from "../domain/errors.js";
import { Effect } from "effect";
import { logRuntime } from "../observability/RuntimeLogger.js";

type RejectMeta = Record<string, unknown>;

export const rejectSocket = (
    broadcaster: Broadcaster,
    socketId: string,
    reason: RuntimeRejectReason,
    meta?: RejectMeta
): void => {
    Effect.runSync(logRuntime("debug", "runtime.reject", {
        socketId,
        reason,
        ...(meta ?? {})
    }));
    const domainError = toDomainError(reason);
    broadcaster.reject(socketId, domainError._tag);
};
