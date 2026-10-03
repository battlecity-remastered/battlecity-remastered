import { hasBlockingBuildingAtTile, overlapsFootprint } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import type { ImportLayout } from "./CityImportParser.js";
import citySpawns from "../../../data/citySpawns.json" with { type: "json" };
export type ImportBase = { tileX: number; tileY: number };

export const cityImportBase = (state: RuntimeState, cityId: number): ImportBase => {
    const center = [...state.buildings.values()].find(building => building.cityId === cityId && building.type === 0);
    const base = center ?? (citySpawns as Record<string, ImportBase>)[String(cityId)];
    if (!base) throw Error("Unable to find your city's command centre.");
    return { tileX: base.tileX, tileY: base.tileY };
};
const assertTerrain = (state: RuntimeState, x: number, y: number, size: number, placement = true): void => {
    const terrain = placement && state.buildBlockingTiles.size ? state.buildBlockingTiles : state.blockingTiles;
    for (let dx = 0; dx < size; dx++) for (let dy = 0; dy < size; dy++) {
        if (terrain.has(`${x + dx},${y + dy}`)) throw Error(`Layout overlaps terrain at ${x + dx},${y + dy}.`);
    }
};
const assertBounds = (x: number, y: number, size: number, maximum: number): void => {
    if (x < 0 || y < 0 || x + size > maximum || y + size > maximum) throw Error("Layout extends beyond the playable map.");
};
const validateBuildings = (state: RuntimeState, cityId: number, layout: ImportLayout, base: ImportBase, maximum: number) => {
    const occupied = [...state.buildings.values()].filter(building => building.cityId !== cityId);
    const planned = layout.buildings.map(entry => ({ type: entry.type, tileX: base.tileX + entry.dx, tileY: base.tileY + entry.dy }));
    const uniqueTypes = new Set<number>();
    for (const building of planned) {
        const { type, tileX, tileY } = building;
        assertBounds(tileX, tileY, 3, maximum);
        if (type !== 300 && uniqueTypes.has(type)) throw Error("Only housing may appear more than once.");
        uniqueTypes.add(type);
        if (type === 0 && (tileX !== base.tileX || tileY !== base.tileY)) throw Error("Keep the command centre at offset 0,0.");
        if (type !== 0) assertTerrain(state, tileX, tileY, 3);
        if (occupied.some(other => overlapsFootprint(tileX, tileY, other.tileX, other.tileY))) throw Error("Buildings overlap each other or another city.");
        for (const defense of state.defenses.values()) if (defense.cityId !== cityId && defense.tileX >= tileX && defense.tileX < tileX + 3 && defense.tileY >= tileY && defense.tileY < tileY + 3) throw Error("A building overlaps another city's defense.");
        occupied.push({ ...building, id: "planned", ownerId: "planned", cityId, health: 120, maxHealth: 120, population: 0 });
    }
    return planned;
};
export const validateCityImport = (state: RuntimeState, cityId: number, layout: ImportLayout, base: ImportBase, config: RuntimeConfig): void => {
    const maximum = Math.floor(config.mapMax / config.tileSize);
    const planned = validateBuildings(state, cityId, layout, base, maximum);
    const allBuildings = [...state.buildings.values()].filter(building => building.cityId !== cityId).concat(planned.map(building => ({ ...building, id: "planned", ownerId: "planned", cityId, health: 120, maxHealth: 120, population: 0 })));
    const occupied = new Set<string>();
    for (const defense of state.defenses.values()) if (defense.cityId !== cityId) occupied.add(`${defense.tileX},${defense.tileY}`);
    for (const hazard of state.hazards.values()) if (hazard.cityId !== cityId) occupied.add(`${hazard.x / config.tileSize},${hazard.y / config.tileSize}`);
    for (const entry of layout.installations) {
        const x = base.tileX + entry.dx, y = base.tileY + entry.dy, key = `${x},${y}`;
        assertBounds(x, y, 1, maximum); assertTerrain(state, x, y, 1, false);
        if (occupied.has(key) || hasBlockingBuildingAtTile(allBuildings, x, y)) throw Error("A defense overlaps a building or another installation.");
        occupied.add(key);
    }
};
