import { io, type Socket } from "socket.io-client";
import {
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

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8121";
const MANUAL_PING_INTERVAL_MS = 4000;

export type SocketRuntime = {
    socket: Socket;
    send: EventSender;
    stop: () => void;
};

export const createSocketRuntime = (state: ClientState): SocketRuntime => {
    let seq = 0;
    let pingIntervalId: number | null = null;
    let pingListenersAttached = false;
    let lastEnginePingAt: number | null = null;

    const nextSeq = (): number => {
        seq += 1;
        return seq;
    };

    const socket = io(SERVER_URL, {
        transports: ["websocket"]
    });

    const send: EventSender = (type, payload) => {
        recordDebugOutboundSend(state);
        socket.emit("event", makeEnvelope(type, nextSeq(), payload));
    };

    const monotonicNow = (): number => {
        if (typeof performance !== "undefined" && typeof performance.now === "function") {
            return performance.now();
        }
        return Date.now();
    };

    const attachPingListeners = (): void => {
        if (pingListenersAttached) {
            return;
        }
        const engine = socket.io?.engine;
        if (!engine || typeof engine.on !== "function") {
            return;
        }
        engine.on("ping", () => {
            lastEnginePingAt = monotonicNow();
        });
        engine.on("pong", (latency?: number) => {
            if (Number.isFinite(latency)) {
                recordDebugLatencySample(state, Number(latency), Date.now());
                return;
            }
            if (lastEnginePingAt !== null) {
                recordDebugLatencySample(state, Math.max(0, monotonicNow() - lastEnginePingAt), Date.now());
            }
        });
        pingListenersAttached = true;
    };

    const runManualPing = (): void => {
        if (!socket.connected) {
            return;
        }
        const sentAt = monotonicNow();
        socket.emit("latency:ping", { sentAtEpoch: Date.now() }, () => {
            const latency = Math.max(0, monotonicNow() - sentAt);
            recordDebugLatencySample(state, latency, Date.now());
        });
    };

    const onServerEvent = (raw: unknown): void => {
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

    socket.on("connect", () => {
        recordDebugSocketState(state, true);
        attachPingListeners();
        runManualPing();
        Effect.runSync(logClient("socket.connected", {
            socketId: socket.id
        }));
    });
    socket.on("disconnect", (reason) => {
        recordDebugSocketState(state, false);
        Effect.runSync(logClient("socket.disconnected", {
            socketId: socket.id,
            reason
        }));
    });
    socket.on("event", onServerEvent);
    if (typeof window !== "undefined") {
        pingIntervalId = window.setInterval(runManualPing, MANUAL_PING_INTERVAL_MS);
    }

    return {
        socket,
        send,
        stop: () => {
            socket.off("event", onServerEvent);
            if (pingIntervalId !== null) {
                window.clearInterval(pingIntervalId);
                pingIntervalId = null;
            }
            socket.disconnect();
        }
    };
};
