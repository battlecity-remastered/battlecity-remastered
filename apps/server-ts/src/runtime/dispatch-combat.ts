import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { emitPlayersSnapshot } from "./snapshot.js";
import { rejectSocket } from "./rejections.js";
import type { Broadcaster, RuntimeEmitter } from "./emitter.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";
import { detonateActiveBombsOwnedBy } from "../domain/hazards/HazardService.js";
import { eliminatePlayer } from "./player-elimination.js";

type BotDamageContext = {
    state: RuntimeState;
    config: RuntimeConfig;
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
        eliminatePlayer(
            context.state,
            context.emitter,
            context.config,
            socketId,
            typeof payload.shooterId === "string" && payload.shooterId.length > 0
                ? { by: payload.shooterId }
                : {}
        );
        detonateActiveBombsOwnedBy(context.state, context.emitter, context.config, socketId);
    }

    emitPlayersSnapshot(context.state, context.emitter);
};
