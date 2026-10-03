import { advancePointByTankHeading32 } from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeBotController, RuntimeConfig, RuntimePlayer, RuntimeState } from "../../runtime/types.js";
import { isHazardPlacementBlocked, LEGACY_MINE_DAMAGE } from "../hazards/hazard-constants.js";
import { isBotTopLeftPositionValid, resolveCityCenter } from "./BotShared.js";

type PatrolPoint = { x: number; y: number };
const patrolCache = new WeakMap<RuntimeState, Map<number, { signature: string; goals: PatrolPoint[] }>>();

export const cityPatrolGoals = (state: RuntimeState, config: RuntimeConfig, cityId: number): PatrolPoint[] => {
    const buildings = [...state.buildings.values()].filter(building => building.cityId === cityId);
    const signature = JSON.stringify([buildings.map(building => [building.id, building.type, building.tileX, building.tileY]), [...state.defenses.values()].map(defense => [defense.id, defense.tileX, defense.tileY])]);
    let cities = patrolCache.get(state);
    if (!cities) { cities = new Map(); patrolCache.set(state, cities); }
    const cached = cities.get(cityId);
    if (cached?.signature === signature) return cached.goals;
    const center = resolveCityCenter(cityId, config);
    const candidates = buildings.length ? buildings.map(building => ({
        x: (building.tileX + 1) * config.tileSize, y: (building.tileY + 3) * config.tileSize
    })) : [{ x: center.x - 24, y: center.y + config.tileSize * 3 }];
    const goals = candidates.filter(point => isBotTopLeftPositionValid(state, config, point.x, point.y));
    cities.set(cityId, { signature, goals });
    return goals;
};

// Patrol useful city entrances rather than trying to drive into the command centre.
export const defenderPatrolGoal = (
    state: RuntimeState, config: RuntimeConfig, bot: RuntimePlayer,
    controller: RuntimeBotController, now: number
): { id: string; x: number; y: number } => {
    const safe = cityPatrolGoals(state, config, bot.city);
    if (!safe.length) return { id: `patrol:${bot.id}:hold`, x: bot.x, y: bot.y };
    const roleIndex = ["mayor", "shooter", "bomb_defuser", "miner"].indexOf(controller.botRole ?? "shooter");
    let index = (controller.patrolIndex ?? Math.floor(Math.max(0, roleIndex) * safe.length / 4)) % safe.length;
    const goal = safe[index]!;
    if (Math.hypot(goal.x - bot.x, goal.y - bot.y) < config.tileSize && now >= (controller.nextPatrolAt ?? 0)) {
        index = (index + 1) % safe.length;
        controller.nextPatrolAt = now + 2500;
    }
    controller.patrolIndex = index;
    return { id: `patrol:${bot.id}:${index}`, ...safe[index]! };
};

const canTrapTarget = (target: RuntimePlayer, city: number, now: number): boolean => !target.isBot && target.city !== city && target.health > 0 && (target.cloakedUntil ?? 0) <= now;
const canPlaceTrap = (state: RuntimeState, config: RuntimeConfig, traps: Array<RuntimeState["hazards"] extends Map<string, infer H> ? H : never>, tileX: number, tileY: number, x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= config.mapMax || y >= config.mapMax || isHazardPlacementBlocked(state, tileX, tileY)) return false;
    // Give players space to react; do not materialize a trap under a tank.
    if ([...state.players.values()].some(player => Math.hypot(player.x + 24 - x - 24, player.y + 24 - y - 24) < config.tileSize * 2)) return false;
    if (traps.some(hazard => Math.hypot(hazard.x - x, hazard.y - y) < config.tileSize * 2)) return false;
    return true;
};

const minerFactoryProducts = (state: RuntimeState, city: number): Set<number> => {
    const products = new Set<number>();
    for (const building of state.buildings.values()) {
        if (building.cityId === city && building.health > 0 && (building.type === 104 || building.type === 107)) products.add(building.type - 100);
    }
    return products;
};

const chooseMinerProduct = (products: ReadonlySet<number>): 4 | 7 => {
    if (!products.has(4)) return 7;
    if (!products.has(7)) return 4;
    return Math.random() < 0.6 ? 4 : 7;
};

export const maybeLayMinerTrap = (
    state: RuntimeState, config: RuntimeConfig, emitter: RuntimeEmitter,
    bot: RuntimePlayer, controller: RuntimeBotController, targetId: string | undefined, now: number
): void => {
    if (controller.botRole !== "miner" || now < (controller.nextHazardAt ?? 0) || (bot.frozenUntil ?? 0) > now) return;
    const target = targetId ? state.players.get(targetId) : undefined;
    if (!target || !canTrapTarget(target, bot.city, now)) return;
    const products = minerFactoryProducts(state, bot.city);
    if (!products.size) return;
    const traps = [...state.hazards.values()].filter(hazard => hazard.active && (hazard.type === 4 || hazard.type === 7));
    if (traps.filter(hazard => hazard.ownerId === bot.id).length >= 6 || traps.filter(hazard => hazard.cityId === bot.city).length >= 32) return;
    controller.nextHazardAt = now + 9000;
    const ahead = advancePointByTankHeading32(target.x + 24, target.y + 24, target.direction, config.tileSize * 3, 1000);
    const tx = Math.floor(ahead.x / config.tileSize), ty = Math.floor(ahead.y / config.tileSize);
    for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [-1, 0], [0, -1]]) {
        const tileX = tx + dx!, tileY = ty + dy!;
        const x = tileX * config.tileSize, y = tileY * config.tileSize;
        if (!canPlaceTrap(state, config, traps, tileX, tileY, x, y)) continue;
        const type = chooseMinerProduct(products);
        const id = `miner_hazard_${++state.seq}`;
        state.hazards.set(id, {
            id, ownerId: bot.id, cityId: bot.city, type, x, y,
            radius: config.tileSize, damage: type === 4 ? LEGACY_MINE_DAMAGE : 0,
            remainingMs: Infinity, armed: true, active: true
        });
        emitter.emit("hazard.spawn", { id, cityId: bot.city, type, position: { x, y }, radius: config.tileSize, armed: true, active: true });
        return;
    }
};
