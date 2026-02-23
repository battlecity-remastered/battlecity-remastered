import type { KnownEventPayloadByType } from "@battlecity/protocol";
import { okResult, rejectResult, type CommandResult, type RuntimeConfig, type RuntimeHazard, type RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { distanceSquared } from "../shared/distance.js";

export const deployHazard = (
    state: RuntimeState,
    cityId: number,
    payload: KnownEventPayloadByType["hazard.deploy.request"],
    nextSeq: () => number,
    config: RuntimeConfig
): CommandResult<KnownEventPayloadByType["hazard.spawn"]> => {
    if (payload.cityId !== cityId) {
        return rejectResult("hazard_invalid");
    }

    const hazard: RuntimeHazard = {
        id: `hazard_${nextSeq()}`,
        cityId,
        type: payload.type,
        x: payload.position.x,
        y: payload.position.y,
        radius: Math.max(8, Math.floor(payload.radius ?? config.hazardDefaultRadius)),
        damage: Math.max(1, Math.floor(payload.damage ?? config.hazardDefaultDamage)),
        remainingMs: Math.max(100, Math.floor(payload.fuseMs ?? config.hazardDefaultFuseMs))
    };
    state.hazards.set(hazard.id, hazard);

    return okResult({
        id: hazard.id,
        cityId: hazard.cityId,
        type: hazard.type,
        position: { x: hazard.x, y: hazard.y },
        radius: hazard.radius
    });
};

export const tickHazards = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    deltaMs: number
): void => {
    for (const [hazardId, hazard] of state.hazards.entries()) {
        hazard.remainingMs -= deltaMs;
        if (hazard.remainingMs > 0) {
            state.hazards.set(hazardId, hazard);
            continue;
        }

        const radiusSq = hazard.radius * hazard.radius;
        for (const [playerId, player] of state.players.entries()) {
            if (player.city !== hazard.cityId) {
                continue;
            }
            if (distanceSquared({ x: player.x, y: player.y }, { x: hazard.x, y: hazard.y }) > radiusSq) {
                continue;
            }
            const health = Math.max(0, player.health - hazard.damage);
            state.players.set(playerId, { ...player, health });
            emitter.emit("player.health", {
                id: playerId,
                health,
                maxHealth: player.maxHealth,
                source: "hazard"
            });
            if (health === 0) {
                emitter.emit("player.dead", { id: playerId });
            }
        }

        state.hazards.delete(hazardId);
        emitter.emit("hazard.remove", {
            id: hazardId,
            reason: "detonated"
        });
    }
};
