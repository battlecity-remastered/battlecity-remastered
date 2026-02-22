import type { KnownEventPayloadByType, KnownTypedEventEnvelope } from "@battlecity/protocol";
import { emitPlayersSnapshot } from "./snapshot.js";
import type { RuntimeEmitter } from "./emitter.js";
import type { Broadcaster } from "./emitter.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";
import { upsertPlayerFromUpdate } from "./player-runtime.js";
import { createBulletFromRequest } from "./bullet-runtime.js";
import { demolishBuildingFromRequest, placeBuildingFromRequest } from "./building-runtime.js";

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

type RuntimeCommandResult<T> =
    | { ok: true; value: T }
    | { ok: false; reason: string };

const handleCommandResult = <T>(
    socketId: string,
    context: DispatchContext,
    result: RuntimeCommandResult<T>,
    onOk: (value: T) => void
): void => {
    if (!result.ok) {
        context.broadcaster.reject(socketId, result.reason);
        return;
    }
    onOk(result.value);
};

const handlers: HandlerMap = {
    "lobby.join.request": (socketId, payload, context) => {
        const city = typeof payload.desiredCity === "number"
            ? Math.max(0, Math.floor(payload.desiredCity))
            : context.config.defaultCity;
        const role = "recruit" as const;

        context.state.socketCities.set(socketId, city);
        context.state.socketRoles.set(socketId, role);
        context.emitter.emitTo(socketId, "lobby.assignment", {
            id: socketId,
            city,
            role
        });
        emitPlayersSnapshot(context.state, context.emitter);
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
