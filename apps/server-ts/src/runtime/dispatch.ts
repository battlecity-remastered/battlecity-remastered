import type { KnownEventPayloadByType, KnownTypedEventEnvelope } from "@battlecity/protocol";
import { emitPlayersSnapshot } from "./snapshot.js";
import type { RuntimeEmitter } from "./emitter.js";
import type { Broadcaster } from "./emitter.js";
import type { CommandResult, RuntimeConfig, RuntimeState } from "./types.js";
import { upsertPlayerFromUpdate } from "./player-runtime.js";
import { createBulletFromRequest } from "./bullet-runtime.js";
import { demolishBuildingFromRequest, placeBuildingFromRequest } from "./building-runtime.js";
import { buildLobbySnapshot, joinLobby, leaveLobby } from "../domain/lobby/LobbyService.js";

type DispatchContext = {
    state: RuntimeState;
    config: RuntimeConfig;
    emitter: RuntimeEmitter;
    broadcaster: Broadcaster;
    nextSeq: () => number;
};

type RuntimeHandler<TType extends keyof KnownEventPayloadByType> = (
    socketId: string,
    payload: KnownEventPayloadByType[TType],
    context: DispatchContext
) => void;

type HandlerMap = {
    [K in keyof KnownEventPayloadByType]?: RuntimeHandler<K>;
};

const handleCommandResult = <T>(
    socketId: string,
    context: DispatchContext,
    result: CommandResult<T>,
    onOk: (value: T) => void
): void => {
    if (!result.ok) {
        if (result.reason === "lobby_full") {
            context.emitter.emitTo(socketId, "lobby.denied", {
                reason: result.reason
            });
        }
        context.broadcaster.reject(socketId, result.reason);
        return;
    }
    onOk(result.value);
};

const handlers: HandlerMap = {
    "lobby.join.request": (socketId, payload, context) => {
        handleCommandResult(socketId, context, joinLobby(
            context.state,
            socketId,
            payload.desiredCity,
            context.config
        ), (assignment) => {
            context.emitter.emitTo(socketId, "lobby.assignment", assignment);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
            emitPlayersSnapshot(context.state, context.emitter);
        });
    },
    "lobby.leave.request": (socketId, _payload, context) => {
        const released = leaveLobby(context.state, socketId);
        if (released) {
            context.emitter.emit("lobby.released", released);
            context.emitter.emit("lobby.snapshot", buildLobbySnapshot(context.state, context.config));
        }
    },
    "player.update": (socketId, payload, context) => {
        upsertPlayerFromUpdate(context.state, socketId, payload, context.config);
        emitPlayersSnapshot(context.state, context.emitter);
    },
    "bullet.fire.request": (socketId, payload, context) => {
        handleCommandResult(
            socketId,
            context,
            createBulletFromRequest(
                context.state,
                socketId,
                payload,
                context.config,
                context.nextSeq
            ),
            (bullet) => {
                context.emitter.emit("bullet.fired", {
                    id: bullet.id,
                    ownerId: bullet.ownerId,
                    city: bullet.city,
                    position: {
                        x: bullet.x,
                        y: bullet.y
                    },
                    direction: bullet.direction,
                    type: bullet.type
                });
            }
        );
    },
    "building.place.request": (socketId, payload, context) => {
        handleCommandResult(
            socketId,
            context,
            placeBuildingFromRequest(
                context.state,
                socketId,
                payload,
                context.config,
                context.nextSeq
            ),
            (building) => {
                context.emitter.emit("building.placed", building);
            }
        );
    },
    "building.demolish.request": (socketId, payload, context) => {
        handleCommandResult(
            socketId,
            context,
            demolishBuildingFromRequest(context.state, socketId, payload),
            (building) => {
                context.emitter.emit("building.demolished", {
                    id: building.id,
                    cityId: building.cityId
                });
            }
        );
    }
};

const dispatchByType = <TType extends keyof KnownEventPayloadByType>(
    socketId: string,
    type: TType,
    payload: KnownEventPayloadByType[TType],
    context: DispatchContext
): void => {
    const handler = handlers[type] as RuntimeHandler<TType> | undefined;
    if (!handler) {
        return;
    }
    handler(socketId, payload, context);
};

export const dispatchRuntimeEvent = (
    socketId: string,
    event: KnownTypedEventEnvelope,
    context: DispatchContext
): void => {
    dispatchByType(
        socketId,
        event.type,
        event.payload as KnownEventPayloadByType[typeof event.type],
        context
    );
};
