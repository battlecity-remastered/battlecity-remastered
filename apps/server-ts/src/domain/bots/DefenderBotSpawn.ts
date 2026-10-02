import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import { createBotPathContext, findBotPath } from "./BotPathingService.js";
import { isBotTopLeftPositionValid, resolveCityCenter } from "./BotShared.js";
import { cityPatrolGoals } from "./DefenderBotActivities.js";

export const findDefenderSpawn = (state: RuntimeState, config: RuntimeConfig, cityId: number): { x: number; y: number; patrolIndex?: number } | undefined => {
    const center = resolveCityCenter(cityId, config);
    const angle = Math.random() * Math.PI * 2;
    const context = createBotPathContext();
    const checked = new Set<string>();
    const isSafe = (x: number, y: number, goalX = center.x - 24, goalY = center.y + config.tileSize): boolean => {
        const key = `${x},${y}:${goalX},${goalY}`;
        if (checked.has(key)) return false;
        checked.add(key);
        if (x < 0 || y < 0 || x + 48 > config.mapMax || y + 48 > config.mapMax) return false;
        if (!isBotTopLeftPositionValid(state, config, x, y)) return false;
        const clearanceSq = (config.tileSize * 2) ** 2;
        if ([...state.players.values()].some(player => (player.x - x) ** 2 + (player.y - y) ** 2 < clearanceSq)) return false;
        return !!findBotPath(state, config, x, y, goalX, goalY,
            { searchRadiusTiles: 32, maxNodes: 8000, context });
    };
    for (let sample = 0; sample < 32; sample++) {
        const heading = angle + sample * Math.PI / 16;
        const radius = config.tileSize * (sample % 2 ? 8 : 10);
        const x = Math.floor((center.x + Math.cos(heading) * radius - 24) / config.tileSize) * config.tileSize;
        const y = Math.floor((center.y + Math.sin(heading) * radius - 24) / config.tileSize) * config.tileSize;
        if (isSafe(x, y)) return { x, y };
    }
    // Generated defenses can isolate the command-centre approach. Other city
    // entrances are valid patrol destinations and provide a bounded fallback.
    for (const [patrolIndex, goal] of cityPatrolGoals(state, config, cityId).entries()) {
        for (const [dx, dy] of [[0, 2], [2, 0], [-2, 0], [0, 3], [3, 0], [-3, 0]]) {
            const x = goal.x + dx! * config.tileSize, y = goal.y + dy! * config.tileSize;
            if (isSafe(x, y, goal.x, goal.y)) return { x, y, patrolIndex };
        }
    }
    return undefined;
};
