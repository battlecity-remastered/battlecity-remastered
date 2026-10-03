// Authoritative values from v0.0.79 server/src/gameplay/constants.js.
// Keep these shared so the client presentation cannot silently change balance.
export const CLASSIC_TANK_HEALTH = 40;
export const CLASSIC_CLOAK_MS = 5000;
export const CLASSIC_SHOT_INTERVAL_MS = 650;
export const CLASSIC_FLARE_INTERVAL_MS = 500;
export const classicBulletDamage = (type: number): number => type === 1 ? 8 : 5;
export const classicBulletRange = (type: number): number => type === 0 ? 260 : type === 3 ? 48 : 340;
export const classicBulletSpeed = (type: number, normalSpeed = 800): number => type === 3 ? 100 : normalSpeed;
