import { io, type Socket } from "socket.io-client";
import {
    decodeKnownEnvelope,
    makeEnvelope,
} from "@battlecity/protocol";
import { Effect } from "effect";
import type { ClientState } from "../app/state.js";
import { applyServerEvent } from "../app/network-events.js";
import type { EventSender } from "./events.js";

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? "http://localhost:8121";

export type SocketRuntime = {
    socket: Socket;
    send: EventSender;
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

    socket.on("connect", () => {
        send("lobby.join.request", { desiredCity: 0 });
    });

    socket.on("event", (raw: unknown) => {
        const program = Effect.sync(() => decodeKnownEnvelope(raw)).pipe(
            Effect.flatMap((decoded) => {
                if (decoded._tag !== "Right") {
                    return Effect.void;
                }
                return Effect.sync(() => {
                    applyServerEvent(state, decoded.right);
                });
            })
        );

        Effect.runSync(program);
    });

    return {
        socket,
        send
    };
};
