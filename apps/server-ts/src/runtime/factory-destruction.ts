import { emitInventoryState } from "../domain/inventory/InventoryService.js";
import type { RuntimeEmitter } from "./emitter.js";
import type { RuntimeBuilding, RuntimeState } from "./types.js";

const PURGE_HAZARD_ITEM_TYPES = new Set([3, 4, 7]);
const PURGE_DEFENSE_ITEM_TYPES = new Set([8, 9, 10, 11]);

const isFactoryBuilding = (buildingType: number): boolean => {
    return Number.isFinite(buildingType) && buildingType >= 100 && Math.floor(buildingType / 100) === 1;
};

export const purgeFactoryOutputsForDestroyedBuilding = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    building: RuntimeBuilding
): void => {
    if (!isFactoryBuilding(building.type)) {
        return;
    }

    const cityId = building.cityId;
    const itemType = building.type % 100;

    const cityStock = state.factoryStock.get(cityId) ?? new Map<number, number>();
    cityStock.set(itemType, 0);
    state.factoryStock.set(cityId, cityStock);
    emitter.emit("factory.stock", {
        cityId,
        itemType,
        stock: 0
    });

    if (PURGE_HAZARD_ITEM_TYPES.has(itemType)) {
        for (const [hazardId, hazard] of Array.from(state.hazards.entries())) {
            if (hazard.cityId !== cityId || hazard.type !== itemType) {
                continue;
            }
            state.hazards.delete(hazardId);
            emitter.emit("hazard.remove", {
                id: hazardId,
                reason: "cleared"
            });
        }
    }

    if (PURGE_DEFENSE_ITEM_TYPES.has(itemType)) {
        for (const [defenseId, defense] of Array.from(state.defenses.entries())) {
            if (defense.cityId !== cityId || defense.type !== itemType) {
                continue;
            }
            state.defenses.delete(defenseId);
            emitter.emit("defense.remove", {
                id: defenseId,
                reason: "cleared"
            });
        }
    }

    for (const [playerId, inventory] of state.playerInventory.entries()) {
        if (state.socketCities.get(playerId) !== cityId) {
            continue;
        }
        if (!inventory.has(itemType)) {
            continue;
        }
        inventory.delete(itemType);
        state.playerInventory.set(playerId, inventory);
        emitter.emitTo(playerId, "inventory.update", emitInventoryState(state, playerId));
    }
};
