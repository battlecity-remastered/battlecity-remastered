import type { ClientState } from "../../app/state.js";

export const summarizeRogueTanks = (state: ClientState): {
    hostilePlayers: number;
    nearestDistance: number | null;
} => {
    let hostilePlayers = 0;
    let nearestDistance: number | null = null;

    for (const remote of state.remotePlayers.values()) {
        if (remote.city === state.local.city) {
            continue;
        }
        hostilePlayers += 1;
        const dx = remote.x - state.local.x;
        const dy = remote.y - state.local.y;
        const distance = Math.hypot(dx, dy);
        if (nearestDistance === null || distance < nearestDistance) {
            nearestDistance = distance;
        }
    }

    return {
        hostilePlayers,
        nearestDistance
    };
};
