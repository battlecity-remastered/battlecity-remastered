const DEFENSE_BURN_THRESHOLD_BY_TYPE: Readonly<Record<number, number>> = Object.freeze({
    8: 20,
    9: 8,
    10: 16,
    11: 20
});

export const resolveDefenseDamageColumn = (
    defenseType: number,
    health: number,
    maxHealth: number
): number => {
    if (!Number.isFinite(maxHealth) || maxHealth <= 0 || !Number.isFinite(health) || health >= maxHealth) {
        return 0;
    }

    const clampedHealth = Math.max(0, health);
    const ratio = clampedHealth / maxHealth;
    const burnThreshold = DEFENSE_BURN_THRESHOLD_BY_TYPE[defenseType];
    if (clampedHealth <= 0 || (typeof burnThreshold === "number" && clampedHealth <= burnThreshold)) {
        return 2;
    }
    if (ratio <= 0.66) {
        return 1;
    }
    return 0;
};
