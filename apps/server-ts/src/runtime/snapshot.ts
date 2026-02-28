import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "./emitter.js";
import type { RuntimeState } from "./types.js";

export const buildPlayersSnapshot = (state: RuntimeState): KnownEventPayloadByType["players.snapshot"] => {
    return {
        serverTime: Date.now(),
        players: Array.from(state.players.values()).map((player) => {
            return {
                id: player.id,
                city: player.city,
                direction: player.direction,
                offset: {
                    x: player.x,
                    y: player.y
                },
                health: player.health,
                maxHealth: player.maxHealth
            };
        })
    };
};

export const emitPlayersSnapshot = (state: RuntimeState, emitter: RuntimeEmitter): void => {
    emitter.emit("players.snapshot", buildPlayersSnapshot(state));
};
