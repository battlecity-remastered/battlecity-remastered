import citySpawns from "../../../data/citySpawns.json" with { type: "json" };
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

export const seedCommandCenter = (state: RuntimeState, city: number, config: RuntimeConfig): void => {
    if ([...state.buildings.values()].some(building => building.cityId === city && building.type === 0)) return;
    const spawn = (citySpawns as Record<string, { tileX: number; tileY: number }>)[String(city)];
    if (!spawn) return;
    const id = `command_center_${city}`;
    state.buildings.set(id, { id, ownerId: `city_${city}`, cityId: city, type: 0, tileX: spawn.tileX, tileY: spawn.tileY, health: config.defaultBuildingHealth, maxHealth: config.defaultBuildingHealth, population: 0 });
};

export const initializeJoinedPlayer = (state: RuntimeState, city: number, playerId: string, config: RuntimeConfig): void => {
    seedCommandCenter(state, city, config);
    const spawn = (citySpawns as Record<string, { tileX: number; tileY: number }>)[String(city)];
    if (!spawn) return;
    state.players.set(playerId, { id: playerId, city, x: spawn.tileX * 48 + 72 - 24 - 6.5, y: spawn.tileY * 48 + 96 - 5.5, direction: 0, speed: config.playerSpeed, health: 100, maxHealth: 100, lastAcceptedUpdateAt: Date.now() });
};
