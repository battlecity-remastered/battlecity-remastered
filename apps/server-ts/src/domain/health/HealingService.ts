import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

const cityHasHospital = (state: RuntimeState, cityId: number, config: RuntimeConfig): boolean => {
    for (const building of state.buildings.values()) {
        if (building.cityId === cityId && building.type === config.hospitalBuildingType) {
            return true;
        }
    }
    return false;
};

export const tickHospitalHealing = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter
): void => {
    for (const [playerId, player] of state.players.entries()) {
        if (player.health >= player.maxHealth) {
            continue;
        }
        if (!cityHasHospital(state, player.city, config)) {
            continue;
        }

        const healed = Math.min(player.maxHealth, player.health + config.hospitalHealPerTick);
        if (healed === player.health) {
            continue;
        }

        state.players.set(playerId, {
            ...player,
            health: healed
        });
        emitter.emit("player.health", {
            id: playerId,
            health: healed,
            maxHealth: player.maxHealth,
            source: "hospital"
        });
    }
};
