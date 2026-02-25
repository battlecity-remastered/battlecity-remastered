import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { emitPlayersSnapshot } from "./snapshot.js";
import { removePlayer } from "./player-runtime.js";
import { rejectSocket } from "./rejections.js";
import type { Broadcaster, RuntimeEmitter } from "./emitter.js";
import type { RuntimeState } from "./types.js";

type BotDamageContext = {
    state: RuntimeState;
    emitter: RuntimeEmitter;
    broadcaster: Broadcaster;
};

export const handlePlayerBotDamage = (
    socketId: string,
    payload: KnownEventPayloadByType["player.bot_damage"],
    context: BotDamageContext
): void => {
    const player = context.state.players.get(socketId);
    if (!player) {
        rejectSocket(context.broadcaster, socketId, "player_not_joined", {
            eventType: "player.bot_damage",
            payload
        });
        return;
    }

    const amount = Math.max(0, Math.min(40, Math.floor(payload.amount)));
    if (amount <= 0) {
        rejectSocket(context.broadcaster, socketId, "invalid_player_update", {
            eventType: "player.bot_damage",
            payload
        });
        return;
    }

    const nextHealth = Math.max(0, player.health - amount);
    context.state.players.set(socketId, {
        ...player,
        health: nextHealth
    });
    context.emitter.emit("player.health", {
        id: socketId,
        health: nextHealth,
        maxHealth: player.maxHealth,
        source: "bot_bullet"
    });

    if (nextHealth <= 0) {
        context.emitter.emit("player.dead", {
            id: socketId,
            by: payload.shooterId
        });
        const removedBulletIds = removePlayer(context.state, socketId);
        for (const bulletId of removedBulletIds) {
            context.emitter.emit("bullet.resolved", {
                id: bulletId,
                reason: "out_of_bounds"
            });
        }
    }

    emitPlayersSnapshot(context.state, context.emitter);
};
