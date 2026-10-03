import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { resolveCityCenter } from "./BotShared.js";

// v0.0.79 measured the whole city, added four tiles to its engagement
// radius, then spawned another sixteen tiles beyond that boundary.
export const rogueSpawnRadii = (state: RuntimeState, config: RuntimeConfig, cityId: number): { min: number; max: number } => {
    const center = resolveCityCenter(cityId, config);
    let extent = 0;
    for (const building of state.buildings.values()) {
        if (building.cityId !== cityId) continue;
        for (const dx of [0, 3]) for (const dy of [0, 3]) {
            extent = Math.max(extent, Math.hypot((building.tileX + dx) * config.tileSize - center.x, (building.tileY + dy) * config.tileSize - center.y));
        }
    }
    const min = Math.max(11 * config.tileSize, extent + 4 * config.tileSize) + 16 * config.tileSize;
    return { min, max: min + 7 * config.tileSize };
};

export const rogueWaveSize = (state: RuntimeState, config: RuntimeConfig, cityId: number): number => {
    let buildings = 0;
    for (const building of state.buildings.values()) if (building.cityId === cityId) buildings++;
    return Math.min(config.rogueMaxBots, buildings >= 32 ? 2 : 1);
};
