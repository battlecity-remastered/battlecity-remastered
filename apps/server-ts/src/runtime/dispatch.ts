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
        const result = createBulletFromRequest(
            context.state,
            socketId,
            payload,
            context.config,
            context.nextSeq
        );
        if (!result.ok) {
            context.broadcaster.reject(socketId, result.reason);
            return;
        }

        const bullet = result.value;
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
    },
    "building.place.request": (socketId, payload, context) => {
        const result = placeBuildingFromRequest(
            context.state,
            socketId,
            payload,
            context.config,
            context.nextSeq
        );
        if (!result.ok) {
            context.broadcaster.reject(socketId, result.reason);
            return;
        }

        context.emitter.emit("building.placed", result.value);
    },
    "building.demolish.request": (socketId, payload, context) => {
        const result = demolishBuildingFromRequest(context.state, socketId, payload);
        if (!result.ok) {
            context.broadcaster.reject(socketId, result.reason);
            return;
        }

        context.emitter.emit("building.demolished", {
            id: result.value.id,
            cityId: result.value.cityId
        });
    }
};

export const dispatchRuntimeEvent = (
    socketId: string,
    event: KnownTypedEventEnvelope,
    context: DispatchContext
): void => {
    const handler = handlers[event.type];
    if (!handler) {
        return;
    }
    handler(socketId, event.payload as never, context);
};
