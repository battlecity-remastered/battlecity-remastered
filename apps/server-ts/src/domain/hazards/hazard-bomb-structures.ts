import { isBombStructureInRange } from "@battlecity/sim-core";
import type { RuntimeEmitter } from "../../runtime/emitter.js";
import type { RuntimeState } from "../../runtime/types.js";
import { purgeFactoryOutputsForDestroyedBuilding } from "../../runtime/factory-destruction.js";
import { unregisterBuildingPopulation } from "../population/PopulationService.js";
import {
    BUILDING_FOOTPRINT_TILES,
    LEGACY_BOMB_STRUCTURE_TILE_RADIUS,
    isWithinTileRadius,
    toTileCenter
} from "./hazard-constants.js";

export const removeStructuresInBombRadius = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    centerTileX: number,
    centerTileY: number
): void => {
    for (const [buildingId, building] of Array.from(state.buildings.entries())) {
        if (!isBombStructureInRange(building.tileX, building.tileY, centerTileX, centerTileY, BUILDING_FOOTPRINT_TILES)) {
            continue;
        }
        purgeFactoryOutputsForDestroyedBuilding(state, emitter, building);
        state.buildings.delete(buildingId);
        emitter.emit("building.demolished", {
            id: building.id,
            cityId: building.cityId
        });
        const populationUpdates = unregisterBuildingPopulation(state, building);
        for (const update of populationUpdates) {
            emitter.emit("population.update", update);
        }
    }

    for (const [defenseId, defense] of Array.from(state.defenses.entries())) {
        if (!isWithinTileRadius(defense.tileX, defense.tileY, centerTileX, centerTileY, LEGACY_BOMB_STRUCTURE_TILE_RADIUS)) {
            continue;
        }
        state.defenses.delete(defenseId);
        emitter.emit("defense.remove", {
            id: defenseId,
            reason: "destroyed"
        });
    }

    for (const [otherHazardId, otherHazard] of Array.from(state.hazards.entries())) {
        const hazardTileX = toTileCenter(otherHazard.x);
        const hazardTileY = toTileCenter(otherHazard.y);
        if (!isWithinTileRadius(hazardTileX, hazardTileY, centerTileX, centerTileY, LEGACY_BOMB_STRUCTURE_TILE_RADIUS)) {
            continue;
        }
        state.hazards.delete(otherHazardId);
        emitter.emit("hazard.remove", {
            id: otherHazardId,
            reason: "detonated"
        });
    }
};
