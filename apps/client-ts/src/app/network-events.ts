import type {
    KnownEventPayloadByType,
    KnownTypedEventEnvelope
} from "@battlecity/protocol";
import type { ClientState } from "./state.js";
import { updateFromSnapshot } from "./state.js";

type EventHandler<TType extends keyof KnownEventPayloadByType> =
    (state: ClientState, payload: KnownEventPayloadByType[TType]) => void;

const setHealth = (state: ClientState, playerId: string, health: number, maxHealth: number): void => {
    if (playerId === state.local.id) {
        state.local.health = health;
        state.local.maxHealth = maxHealth;
        return;
    }

    const remote = state.remotePlayers.get(playerId);
    if (!remote) {
        return;
    }
    remote.health = health;
    remote.maxHealth = maxHealth;
};

const resolveMaxHealth = (state: ClientState, playerId: string): number => {
    if (playerId === state.local.id) {
        return state.local.maxHealth;
    }
    return state.remotePlayers.get(playerId)?.maxHealth ?? 100;
};

const handlers: {
    [K in keyof KnownEventPayloadByType]?: EventHandler<K>;
} = {
    "lobby.assignment": (state, payload) => {
        state.local.id = payload.id;
        state.local.city = payload.city;
        state.lobby.deniedReason = null;
    },
    "lobby.denied": (state, payload) => {
        state.lobby.deniedReason = payload.reason;
    },
    "lobby.snapshot": (state, payload) => {
        state.lobby.assignments = payload.map((entry) => {
            const assignment = {
                city: entry.city,
                recruitCount: entry.recruitCount
            };
            if (typeof entry.mayorId === "string") {
                return {
                    ...assignment,
                    mayorId: entry.mayorId
                };
            }
            return {
                ...assignment
            };
        });
    },
    "lobby.released": (state, payload) => {
        state.lobby.lastReleasedPlayerId = payload.id;
    },
    "players.snapshot": (state, payload) => {
        updateFromSnapshot(state, payload);
    },
    "player.health": (state, payload) => {
        setHealth(state, payload.id, payload.health, payload.maxHealth);
    },
    "player.dead": (state, payload) => {
        setHealth(state, payload.id, 0, resolveMaxHealth(state, payload.id));
    },
    "player.removed": (state, payload) => {
        if (payload.id === state.local.id) {
            return;
        }
        state.remotePlayers.delete(payload.id);
    }
};

export const applyServerEvent = (state: ClientState, event: KnownTypedEventEnvelope): void => {
    const handler = handlers[event.type];
    if (handler) {
        handler(state, event.payload as never);
    }
};
