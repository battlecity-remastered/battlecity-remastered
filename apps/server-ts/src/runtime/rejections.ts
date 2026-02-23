import type { Broadcaster } from "./emitter.js";
import type { RuntimeRejectReason } from "./types.js";
import { toDomainError } from "../domain/errors.js";

export const rejectSocket = (
    broadcaster: Broadcaster,
    socketId: string,
    reason: RuntimeRejectReason
): void => {
    const domainError = toDomainError(reason);
    broadcaster.reject(socketId, domainError._tag);
};
