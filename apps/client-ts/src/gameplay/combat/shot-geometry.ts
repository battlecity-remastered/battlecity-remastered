import { normalizeHeading32 } from "@battlecity/sim-core";
import { STEP_MUZZLE_OFFSETS } from "./muzzle-offsets.js";

const PLAYER_SPRITE_HALF = 24;
const DIRECTION_STEPS = 32;

export const normalizeDirection32 = (direction32: number): number => {
    if (!Number.isFinite(direction32)) {
        return 0;
    }
    const rounded = Math.round(direction32);
    const normalized = rounded % DIRECTION_STEPS;
    if (normalized < 0) {
        return normalized + DIRECTION_STEPS;
    }
    return normalized;
};

export const direction32ToBulletHeading = (direction32: number): number => {
    const direction = normalizeDirection32(direction32);
    return normalizeHeading32(direction - 8);
};

export const resolveTankMuzzlePosition = (
    topLeftX: number,
    topLeftY: number,
    direction32: number
): { x: number; y: number } => {
    const safeX = Number.isFinite(topLeftX) ? topLeftX : 0;
    const safeY = Number.isFinite(topLeftY) ? topLeftY : 0;
    const direction = normalizeDirection32(direction32);
    const muzzleOffset = STEP_MUZZLE_OFFSETS[direction] ?? { x: 0, y: -23.45 };
    const centerX = safeX + PLAYER_SPRITE_HALF;
    const centerY = safeY + PLAYER_SPRITE_HALF;
    return {
        x: centerX + muzzleOffset.x,
        y: centerY + muzzleOffset.y
    };
};
