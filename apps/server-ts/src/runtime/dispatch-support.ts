import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { rejectSocket } from "./rejections.js";
import type { Broadcaster, RuntimeEmitter } from "./emitter.js";
import type { CommandResult, RuntimeRejectReason, RuntimeState } from "./types.js";

type CommandRejectMeta = Record<string, unknown>;

export const emitScopedChatMessage = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    message: KnownEventPayloadByType["chat.message"]
): void => {
    if (message.scope === "global") {
        emitter.emit("chat.message", message);
        return;
    }

    for (const [targetSocketId, city] of state.socketCities.entries()) {
        if (city === message.city) {
            emitter.emitTo(targetSocketId, "chat.message", message);
        }
    }
};

export const handleCommandResult = <T>(
    socketId: string,
    emitter: RuntimeEmitter,
    broadcaster: Broadcaster,
    result: CommandResult<T>,
    onOk: (value: T) => void,
    rejectMeta?: CommandRejectMeta
): void => {
    if (!result.ok) {
        if (result.reason === "lobby_full") {
            emitter.emitTo(socketId, "lobby.denied", {
                reason: result.reason
            });
        }
        rejectSocket(broadcaster, socketId, result.reason as RuntimeRejectReason, rejectMeta);
        return;
    }
    onOk(result.value);
};
