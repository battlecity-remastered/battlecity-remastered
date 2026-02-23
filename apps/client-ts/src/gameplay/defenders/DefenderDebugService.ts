import type { ClientState } from "../../app/state.js";

export const summarizeDefenderState = (state: ClientState): {
    defenseCount: number;
    damagedDefenses: number;
} => {
    let damagedDefenses = 0;
    for (const defense of state.defenses.values()) {
        if (defense.health < defense.maxHealth) {
            damagedDefenses += 1;
        }
    }
    return {
        defenseCount: state.defenses.size,
        damagedDefenses
    };
};
