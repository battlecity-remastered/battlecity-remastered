import { io, type Socket } from "socket.io-client";
import {
    decodeKnownEnvelope,
    makeEnvelope,
    type KnownTypedEventEnvelope
} from "@battlecity/protocol";
import { Effect } from "effect";
import type { ClientState } from "../app/state.js";
import { updateFromSnapshot } from "../app/state.js";
import type { EventSender } from "./events.js";

const SERVER_URL = "http://localhost:8121";

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
                return applyEvent(state, decoded.right);
            })
        );

        Effect.runSync(program);
    });

    return {
        socket,
        send
    };
};

const applyEvent = (state: ClientState, event: KnownTypedEventEnvelope) => {
    return Effect.sync(() => {
        switch (event.type) {
            case "lobby.assignment": {
                state.local.id = event.payload.id;
                state.local.city = event.payload.city;
                return;
            }
            case "players.snapshot": {
                updateFromSnapshot(state, event.payload);
                return;
            }
            case "player.health": {
                if (event.payload.id === state.local.id) {
                    state.local.health = event.payload.health;
                    state.local.maxHealth = event.payload.maxHealth;
                }
                return;
            }
            case "player.dead": {
                if (event.payload.id === state.local.id) {
                    state.local.health = 0;
                }
                return;
            }
            default:
                return;
        }
    });
};
