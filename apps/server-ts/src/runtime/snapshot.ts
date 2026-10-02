import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeEmitter } from "./emitter.js";
import type { RuntimeState } from "./types.js";

const normalizeDirection32Step = (direction: number): number => {
    if (!Number.isFinite(direction)) {
        return 0;
    }
    const normalized = Math.round(direction) % 32;
    return normalized < 0 ? normalized + 32 : normalized;
};

export const buildPlayersSnapshot = (state: RuntimeState): KnownEventPayloadByType["players.snapshot"] => {
    return {
        serverTime: Date.now(),
        players: Array.from(state.players.values()).map((player) => {
            return {
                id: player.id,
                city: player.city,
                direction: normalizeDirection32Step(player.direction),
                offset: {
                    x: player.x,
                    y: player.y
                },
                ...(state.botControllers.get(player.id)?.botRole ? { botRole: state.botControllers.get(player.id)!.botRole! } : {}),
                health: player.health,
                ...(player.lastMovementInputSeq === undefined ? {} : { movementAck: { seq: player.lastMovementInputSeq, direction: player.direction, clippedMs: player.movementClippedMs ?? 0 } }),
                maxHealth: player.maxHealth,
                ...(player.cloakedUntil ? {cloakedUntil:player.cloakedUntil}:{}),
                ...(player.frozenUntil ? {frozenUntil:player.frozenUntil}:{})
            };
        })
    };
};

export const emitPlayersSnapshot = (state: RuntimeState, emitter: RuntimeEmitter): void => {
    emitter.emit("players.snapshot", buildPlayersSnapshot(state));
};
