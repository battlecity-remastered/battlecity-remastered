import { io, type Socket } from "socket.io-client";
import {
    type KnownEventPayloadByType,
    makeEnvelope,
} from "@battlecity/protocol";
import { Effect } from "effect";
import type { ClientState } from "../app/state.js";
import { applyServerEvent } from "../app/network-events.js";
import type { EventSender } from "./events.js";
import { decodeServerEnvelope } from "./event-router.js";
import { logClient } from "../observability/ClientLogger.js";
import {
    recordDebugLatencySample,
    recordDebugOutboundSend,
    recordDebugServerEvent,
    recordDebugSocketState
} from "../app/debug-metrics.js";

const resolveServerUrl = (): string => {
    const env = (import.meta as ImportMeta & { env?: Record<string, unknown>; }).env;
    const configured = env?.VITE_SERVER_URL;
    if (typeof configured === "string" && configured.length > 0) {
        return configured;
    }
    if (typeof window !== "undefined" && typeof window.location?.origin === "string") {
        return window.location.origin;
    }
    return "http://localhost:8121";
};

const SERVER_URL = resolveServerUrl();
const MANUAL_PING_INTERVAL_MS = 4000;

export type SocketRuntime = {
    socket: Socket;
    send: EventSender;
    stop: () => void;
};

type SocketRuntimeContext = {
    seq: number;
    pingIntervalId: number | null;
    pingListenersAttached: boolean;
    lastEnginePingAt: number | null;
    reconnectDesiredCity: number | null;
};

export const clearClientWorldForReconnect = (state: ClientState): void => {
    state.local.id = null;
    state.local.health = 100;
    state.local.maxHealth = 100;

    state.remotePlayers.clear();
    state.cityFinance.clear();
    state.research.clear();
    state.factoryStock.clear();
    state.inventory.clear();
    state.hazards.clear();
    state.bullets.clear();
    state.buildings.clear();
    state.defenses.clear();
    state.chat.rateLimitedUntil = null;
    state.chat.rateLimitedScope = null;

    state.events.lastOrbedCityId = null;
    state.events.lastOrbEvent = null;
    state.events.lastBuildDeniedReason = null;
    state.events.lastDemolishDeniedReason = null;
    state.events.lastIconPickupConfirmed = null;
    state.events.effects.explosions = [];
    state.events.effects.floatingPoints = [];

    state.ui.selectedInventoryItemType = null;
    state.ui.bombArmed = false;
    state.ui.showBuildMenu = false;
    state.ui.buildGhostMode = false;
    state.ui.buildDemolishMode = false;
    state.ui.pendingBuildPlacement = null;

    state.render.previousLocalX = state.local.x;
    state.render.previousLocalY = state.local.y;
    state.render.projectedOffsetX = 0;
    state.render.projectedOffsetY = 0;
    state.render.lastResolvedAt = null;
    state.render.authoritativeSnapshots = [];
};

export const buildReconnectJoinPayload = (
    state: ClientState,
    desiredCity: number
): KnownEventPayloadByType["lobby.join.request"] => {
    return {
        desiredCity,
        callsign: state.identity.callsign,
        ...(typeof state.identity.userId === "string" && state.identity.userId.length > 0
            ? { userId: state.identity.userId }
            : {})
    };
};

const createSocketRuntimeContext = (): SocketRuntimeContext => {
    return {
        seq: 0,
        pingIntervalId: null,
        pingListenersAttached: false,
        lastEnginePingAt: null,
        reconnectDesiredCity: null
    };
};

const monotonicNow = (): number => {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return performance.now();
    }
    return Date.now();
};

const attachPingListeners = (
    socket: Socket,
    state: ClientState,
    context: SocketRuntimeContext
): void => {
    if (context.pingListenersAttached) {
        return;
    }
    const engine = socket.io?.engine;
    if (!engine || typeof engine.on !== "function") {
        return;
    }
    engine.on("ping", () => {
        context.lastEnginePingAt = monotonicNow();
    });
    engine.on("pong", (latency?: number) => {
        if (Number.isFinite(latency)) {
            recordDebugLatencySample(state, Number(latency), Date.now());
            return;
        }
        if (context.lastEnginePingAt !== null) {
            recordDebugLatencySample(state, Math.max(0, monotonicNow() - context.lastEnginePingAt), Date.now());
        }
    });
    context.pingListenersAttached = true;
};

const runManualPing = (socket: Socket, state: ClientState): void => {
    if (!socket.connected) {
        return;
    }
    const sentAt = monotonicNow();
    socket.emit("latency:ping", { sentAtEpoch: Date.now() }, () => {
        const latency = Math.max(0, monotonicNow() - sentAt);
        recordDebugLatencySample(state, latency, Date.now());
    });
};

const onServerEvent = (state: ClientState, raw: unknown): void => {
    const program = decodeServerEnvelope(raw).pipe(
        Effect.flatMap((decoded) => {
            if (!decoded) {
                return logClient("socket.event.ignored", {
                    rawType: typeof raw === "object" && raw && "type" in (raw as Record<string, unknown>)
                        ? (raw as { type?: unknown }).type
                        : null
                });
            }
            return Effect.sync(() => {
                recordDebugServerEvent(state);
                applyServerEvent(state, decoded);
            });
        }),
        Effect.catchAll((error) => logClient("socket.event.decode_error", {
            error: String(error)
        }))
    );

    Effect.runSync(program);
};

const registerConnectHandler = (
    socket: Socket,
    send: EventSender,
    state: ClientState,
    context: SocketRuntimeContext
): void => {
    socket.on("connect", () => {
        recordDebugSocketState(state, true);
        attachPingListeners(socket, state, context);
        runManualPing(socket, state);
        if (context.reconnectDesiredCity !== null) {
            send("lobby.join.request", buildReconnectJoinPayload(state, context.reconnectDesiredCity));
            context.reconnectDesiredCity = null;
        }
        Effect.runSync(logClient("socket.connected", {
            socketId: socket.id
        }));
    });
};

const registerDisconnectHandler = (
    socket: Socket,
    state: ClientState,
    context: SocketRuntimeContext
): void => {
    socket.on("disconnect", (reason) => {
        if (state.local.id !== null) {
            context.reconnectDesiredCity = state.local.city;
            clearClientWorldForReconnect(state);
        }
        recordDebugSocketState(state, false);
        Effect.runSync(logClient("socket.disconnected", {
            socketId: socket.id,
            reason
        }));
    });
};

const maybeStartManualPingInterval = (
    socket: Socket,
    state: ClientState,
    context: SocketRuntimeContext
): void => {
    if (typeof window !== "undefined") {
        context.pingIntervalId = window.setInterval(
            () => runManualPing(socket, state),
            MANUAL_PING_INTERVAL_MS
        );
    }
};

const createStop = (
    socket: Socket,
    onEvent: (raw: unknown) => void,
    context: SocketRuntimeContext
): (() => void) => {
    return () => {
        socket.off("event", onEvent);
        if (context.pingIntervalId !== null && typeof window !== "undefined") {
            window.clearInterval(context.pingIntervalId);
            context.pingIntervalId = null;
        }
        socket.disconnect();
    };
};

export const createSocketRuntime = (state: ClientState): SocketRuntime => {
    const context = createSocketRuntimeContext();
    const nextSeq = (): number => {
        context.seq += 1;
        return context.seq;
    };

    const socket = io(SERVER_URL, {
        transports: ["websocket"]
    });

    const send: EventSender = (type, payload) => {
        recordDebugOutboundSend(state);
        socket.emit("event", makeEnvelope(type, nextSeq(), payload));
    };

    const onEvent = (raw: unknown): void => onServerEvent(state, raw);
    registerConnectHandler(socket, send, state, context);
    registerDisconnectHandler(socket, state, context);
    socket.on("event", onEvent);
    maybeStartManualPingInterval(socket, state, context);

    return {
        socket,
        send,
        stop: createStop(socket, onEvent, context)
    };
};
