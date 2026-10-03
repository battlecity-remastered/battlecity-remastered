import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeBuilding, RuntimeConfig, RuntimeState } from "../../runtime/types.js";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import { purgeFactoryOutputsForDestroyedBuilding } from "../../runtime/factory-destruction.js";
import { registerBuildingPopulation } from "../population/PopulationService.js";
import { emitCityFinance, getOrCreateCity } from "../economy/CityEconomyService.js";
import { refreshCityOrbHistory } from "../orb/CityOrbRules.js";
import { emitResearchState } from "../research/ResearchService.js";
import { DEFENSE_MAX_HEALTH } from "../defense/DefenseService.js";
import { parseCityImport, type ImportEntry, type ImportLayout } from "./CityImportParser.js";
import { cityImportBase, validateCityImport, type ImportBase } from "./CityImportValidation.js";

const clearCityLayout = (state: RuntimeState, cityId: number, emitter: RuntimeEmitter): void => {
    for (const [id, building] of state.buildings) if (building.cityId === cityId) {
        purgeFactoryOutputsForDestroyedBuilding(state, emitter, building);
        state.buildings.delete(id); state.factoryProductionNextAtMs.delete(id);
        emitter.emit("building.demolished", { id, cityId });
    }
    for (const [id, hazard] of state.hazards) if (hazard.cityId === cityId) {
        state.hazards.delete(id); emitter.emit("hazard.remove", { id, reason: "cleared" });
    }
    for (const [id, defense] of state.defenses) if (defense.cityId === cityId) {
        state.defenses.delete(id); emitter.emit("defense.remove", { id, reason: "cleared" });
    }
    for (const itemType of state.factoryStock.get(cityId)?.keys() ?? []) emitter.emit("factory.stock", { cityId, itemType, stock: 0 });
    state.factoryStock.delete(cityId); state.research.delete(cityId);
};
const placeBuildings = (state: RuntimeState, cityId: number, ownerId: string, layout: ImportLayout, base: ImportBase, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    for (const entry of layout.buildings) {
        const building: RuntimeBuilding = { id: `import_building_${++state.seq}`, cityId, ownerId, type: entry.type,
            tileX: base.tileX + entry.dx, tileY: base.tileY + entry.dy, health: config.defaultBuildingHealth, maxHealth: config.defaultBuildingHealth, population: 0 };
        state.buildings.set(building.id, building); emitter.emit("building.placed", building);
        for (const update of registerBuildingPopulation(state, building)) emitter.emit("population.update", update);
    }
};
const placeInstallation = (state: RuntimeState, cityId: number, ownerId: string, entry: ImportEntry, base: ImportBase, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    const tileX = base.tileX + entry.dx, tileY = base.tileY + entry.dy;
    if (entry.type >= 8) {
        const maximum = DEFENSE_MAX_HEALTH[entry.type]!;
        const defense = { id: `import_defense_${++state.seq}`, ownerId, cityId, type: entry.type, tileX, tileY, health: maximum, maxHealth: maximum, orientation: entry.angle, nextShotAt: 0 };
        state.defenses.set(defense.id, defense); emitter.emit("defense.spawn", defense);
    } else {
        const active = entry.type !== 3;
        const hazard = { id: `import_hazard_${++state.seq}`, ownerId, cityId, type: entry.type, x: tileX * config.tileSize, y: tileY * config.tileSize,
            radius: config.tileSize, damage: entry.type === 4 ? 19 : entry.type === 3 ? 25 : 0, remainingMs: Number.MAX_SAFE_INTEGER, active, armed: active };
        state.hazards.set(hazard.id, hazard);
        emitter.emit("hazard.spawn", { id: hazard.id, cityId, type: entry.type, position: { x: hazard.x, y: hazard.y }, radius: hazard.radius, active, armed: active });
    }
};
const applyLayout = (state: RuntimeState, cityId: number, ownerId: string, layout: ImportLayout, base: ImportBase, config: RuntimeConfig, emitter: RuntimeEmitter): void => {
    const city = getOrCreateCity(state, cityId, config);
    refreshCityOrbHistory(state, city);
    clearCityLayout(state, cityId, emitter); city.researchLevel = 0;
    placeBuildings(state, cityId, ownerId, layout, base, config, emitter);
    for (const entry of layout.installations) placeInstallation(state, cityId, ownerId, entry, base, config, emitter);
    refreshCityOrbHistory(state, city);
    emitResearchState(state, cityId, emitter); emitCityFinance(state, cityId, config, emitter);
};
export const importCityLayout = (state: RuntimeState, socketId: string, json: string, config: RuntimeConfig, emitter: RuntimeEmitter): KnownEventPayloadByType["city.layout.result"] => {
    const cityId = state.socketCities.get(socketId);
    if (cityId === undefined) return { cityId: -1, ok: false, message: "Join a city before importing." };
    if (state.socketRoles.get(socketId) !== "mayor") return { cityId, ok: false, message: "Only the mayor can import a city layout." };
    try {
        const layout = parseCityImport(json), base = cityImportBase(state, cityId);
        validateCityImport(state, cityId, layout, base, config);
        applyLayout(state, cityId, socketId, layout, base, config, emitter);
        return { cityId, ok: true, message: `Imported ${layout.buildings.length} buildings and ${layout.installations.length} defenses/hazards.` };
    } catch (error) {
        return { cityId, ok: false, message: error instanceof Error ? error.message : "Unable to import this layout." };
    }
};
