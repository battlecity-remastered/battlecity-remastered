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

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8121";

export type SocketRuntime = {
    socket: Socket;
    send: EventSender;
    stop: () => void;
};

export const createSocketRuntime = (state: ClientState): SocketRuntime => {
    let seq = 0;

    const nextSeq = (): number => {
        seq += 1;
        return seq;
    };

    const socket = io(SERVER_URL, {
        transports: ["websocket"]
    });

    const send: EventSender = (type, payload) => {
        socket.emit("event", makeEnvelope(type, nextSeq(), payload));
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
        Effect.runSync(logClient("socket.connected", {
            socketId: socket.id
        }));
        send("lobby.join.request", {
            desiredCity: state.local.city,
            userId: state.identity.userId ?? undefined,
            callsign: state.identity.callsign
        });
    });
    socket.on("disconnect", (reason) => {
        Effect.runSync(logClient("socket.disconnected", {
            socketId: socket.id,
            reason
        }));
    });
    socket.on("event", onServerEvent);

    return {
        socket,
        send,
        stop: () => {
            socket.off("event", onServerEvent);
            socket.disconnect();
        }
    };
};
