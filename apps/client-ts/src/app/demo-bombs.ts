import { isBombStructureInRange } from "@battlecity/sim-core";
import type { ClientState } from "./state.js";

type Building = ClientState["buildings"] extends Map<string, infer B> ? B : never;
type BombResult = { buildings: Building[]; defenses: string[]; hazards: string[]; blasts: Array<{ x: number; y: number }> };

const removeDefense = (state: ClientState, id: string, result: BombResult): void => {
    const defense = state.defenses.get(id)!;
    result.defenses.push(id);
    state.defenses.delete(id);
    const tile = `${defense.tileX},${defense.tileY}`;
    state.world.blockingTiles.delete(tile);
    state.world.buildBlockingTiles.delete(tile);
};

const clearFactoryProducts = (state: ClientState, building: Building, result: BombResult): void => {
    const type = building.type - 100;
    state.factoryStock.get(building.cityId)?.delete(type);
    state.inventory.delete(type);
    if (type >= 8 && type <= 11) {
        for (const [id, defense] of [...state.defenses]) {
            if (defense.cityId === building.cityId && defense.type === type) removeDefense(state, id, result);
        }
    }
    for (const [id, hazard] of [...state.hazards]) {
        if ([3, 4, 7].includes(type) && hazard.cityId === building.cityId && hazard.type === type) {
            result.hazards.push(id);
            state.hazards.delete(id);
        }
    }
};

const destroyBuildings = (state: ClientState, cx: number, cy: number, result: BombResult): void => {
    for (const [id, building] of [...state.buildings]) {
        if (!isBombStructureInRange(building.tileX, building.tileY, cx, cy, 3)) continue;
        result.buildings.push(building);
        state.buildings.delete(id);
        for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
            const tile = `${building.tileX + dx},${building.tileY + dy}`;
            state.world.blockingTiles.delete(tile);
            state.world.buildBlockingTiles.delete(tile);
        }
        if (building.type >= 100 && building.type <= 112) clearFactoryProducts(state, building, result);
    }
};

const destroyDeployments = (state: ClientState, cx: number, cy: number, result: BombResult): void => {
    for (const [id, defense] of [...state.defenses]) {
        if (isBombStructureInRange(defense.tileX, defense.tileY, cx, cy)) removeDefense(state, id, result);
    }
    for (const [id, hazard] of [...state.hazards]) {
        if (!isBombStructureInRange(Math.floor((hazard.x + 24) / 48), Math.floor((hazard.y + 24) / 48), cx, cy)) continue;
        result.hazards.push(id);
        state.hazards.delete(id);
    }
};

export const detonateDemoBombs = (state: ClientState, now: number): BombResult => {
    const result: BombResult = { buildings: [], defenses: [], hazards: [], blasts: [] };
    for (const [id, bomb] of [...state.hazards]) {
        if (!state.hazards.has(id) || bomb.type !== 3 || !bomb.armed || !bomb.active || bomb.fuseEndsAt === undefined || now < bomb.fuseEndsAt) continue;
        const cx = Math.floor((bomb.x + 24) / 48), cy = Math.floor((bomb.y + 24) / 48);
        result.blasts.push({ x: bomb.x + 24, y: bomb.y + 24 });
        state.events.effects.explosions.push({ id: `demo-blast-${id}`, x: bomb.x + 24, y: bomb.y + 24, variant: "large", createdAt: now });
        destroyBuildings(state, cx, cy, result);
        destroyDeployments(state, cx, cy, result);
    }
    if (state.events.effects.explosions.length > 24) state.events.effects.explosions.splice(0, state.events.effects.explosions.length - 24);
    return result;
};
