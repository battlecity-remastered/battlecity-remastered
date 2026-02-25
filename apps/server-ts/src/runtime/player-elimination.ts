import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { releasePlayerInventory } from "../domain/inventory/InventoryService.js";
import { buildLobbySnapshot, leaveLobby } from "../domain/lobby/LobbyService.js";
import type { RuntimeEmitter } from "./emitter.js";
import { removePlayer } from "./player-runtime.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";

type PlayerEliminationOptions = {
    by?: string;
    emitDeathEvent?: boolean;
};

export type PlayerEliminationResult = {
    wasPresent: boolean;
    removedBulletIds: string[];
    released?: KnownEventPayloadByType["lobby.released"];
};

export const eliminatePlayer = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    config: RuntimeConfig,
    playerId: string,
    options: PlayerEliminationOptions = {}
): PlayerEliminationResult => {
    if (!state.players.has(playerId)) {
        return {
            wasPresent: false,
            removedBulletIds: []
        };
    }

    if (options.emitDeathEvent !== false) {
        const deathPayload: KnownEventPayloadByType["player.dead"] = typeof options.by === "string" && options.by.length > 0
            ? { id: playerId, by: options.by }
            : { id: playerId };
        emitter.emit("player.dead", deathPayload);
    }

    const removedBulletIds = removePlayer(state, playerId);
    for (const bulletId of removedBulletIds) {
        emitter.emit("bullet.resolved", {
            id: bulletId,
            reason: "out_of_bounds"
        });
    }

    emitter.emit("player.removed", { id: playerId });

    const released = leaveLobby(state, playerId);
    releasePlayerInventory(state, playerId);
    if (released) {
        emitter.emit("lobby.released", released);
        emitter.emit("lobby.snapshot", buildLobbySnapshot(state, config));
    }

    return {
        wasPresent: true,
        removedBulletIds,
        ...(released ? { released } : {})
    };
};
