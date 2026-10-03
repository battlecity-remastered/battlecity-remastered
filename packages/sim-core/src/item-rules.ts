// Authoritative values from v0.0.79 server/src/gameplay/constants.js.
// Keep these shared so the client presentation cannot silently change balance.
export const CLASSIC_TANK_HEALTH = 40;
export const CLASSIC_CLOAK_MS = 5000;
export const CLASSIC_SHOT_INTERVAL_MS = 650;
export const CLASSIC_FLARE_INTERVAL_MS = 500;
// v0.0.79 primary fire prefers carried rockets only while stationary.
// Cargo selection is independent: a carried laser remains the moving fallback.
export const classicPrimaryBulletType = (inventory: ReadonlyMap<number, number>, moving: boolean): 0 | 1 | null => {
    if (!moving && (inventory.get(1) ?? 0) > 0) return 1;
    return (inventory.get(12) ?? 0) > 0 ? 0 : null;
};
export const classicBulletDamage = (type: number): number => type === 1 ? 8 : 5;
export const classicBulletRange = (type: number): number => type === 0 ? 260 : type === 3 ? 48 : 340;
export const classicBulletSpeed = (type: number, normalSpeed = 800): number => type === 3 ? 100 : normalSpeed;
