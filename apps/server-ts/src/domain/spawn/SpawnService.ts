import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { clampToWorld, collidesWithBuilding } from "../world/CollisionService.js";

const SEARCH_STEPS = [
    [0, 0],
    [16, 0],
    [-16, 0],
    [0, 16],
    [0, -16],
    [32, 0],
    [-32, 0],
    [0, 32],
    [0, -32],
    [24, 24],
    [-24, 24],
    [24, -24],
    [-24, -24]
] as const;

export const resolveSpawnPosition = (
    state: RuntimeState,
    cityId: number,
    x: number,
    y: number,
    config: RuntimeConfig
): { x: number; y: number } => {
    const clamped = clampToWorld(x, y, config.mapMax);
    if (!collidesWithBuilding(state, cityId, clamped.x, clamped.y)) {
        return clamped;
    }

    for (const [dx, dy] of SEARCH_STEPS) {
        const candidate = clampToWorld(clamped.x + dx, clamped.y + dy, config.mapMax);
        if (!collidesWithBuilding(state, cityId, candidate.x, candidate.y)) {
            return candidate;
        }
    }

    return clamped;
};
