import { asSpawnPayload } from "../domain/defense/DefenseService.js";
import { buildCityFinancePayload, getOrCreateCity } from "../domain/economy/CityEconomyService.js";
import type { RuntimeEmitter } from "./emitter.js";
import { buildPlayersSnapshot } from "./snapshot.js";
import type { RuntimeConfig, RuntimeState } from "./types.js";

import type { DispatchContext } from "./dispatch-context.js";

const emitHydrationEntities = (
    state: RuntimeState,
    emitter: RuntimeEmitter,
    socketId: string
): void => {
    for (const bullet of state.bullets.values()) {
        emitter.emitTo(socketId, "bullet.fired", {
            id: bullet.id,
            ownerId: bullet.ownerId,
            city: bullet.city,
            position: {
                x: bullet.x,
                y: bullet.y
            },
            direction: bullet.direction,
            type: bullet.type
        });
    }

    for (const building of state.buildings.values()) {
        emitter.emitTo(socketId, "building.placed", {
            id: building.id,
            ownerId: building.ownerId,
            cityId: building.cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            health: building.health,
            maxHealth: building.maxHealth
        });
        emitter.emitTo(socketId, "population.update", {
            id: building.id,
            cityId: building.cityId,
            type: building.type,
            tileX: building.tileX,
            tileY: building.tileY,
            population: building.population,
            attachedHouseId: building.attachedHouseId,
            removed: false
        });
    }

    for (const hazard of state.hazards.values()) {
        emitter.emitTo(socketId, "hazard.spawn", {
            id: hazard.id,
            cityId: hazard.cityId,
            type: hazard.type,
            position: {
                x: hazard.x,
                y: hazard.y
            },
            radius: hazard.radius,
            armed: hazard.armed,
            active: hazard.active,
            ...(Number.isFinite(hazard.remainingMs) ? { remainingMs: hazard.remainingMs } : {})
        });
    }

    for (const defense of state.defenses.values()) {
        emitter.emitTo(socketId, "defense.spawn", asSpawnPayload(defense));
    }
};

const emitHydrationCityState = (
    state: RuntimeState,
    config: RuntimeConfig,
    emitter: RuntimeEmitter,
    socketId: string,
    sortedCityIds: number[]
): void => {
    for (const cityId of sortedCityIds) {
        getOrCreateCity(state, cityId, config);
        emitter.emitTo(socketId, "city.finance", buildCityFinancePayload(state, cityId, config));
        const research = state.research.get(cityId);
        emitter.emitTo(socketId, "research.update", {
            cityId,
            active: research?.active
                ? {
                    researchType: research.active.researchType,
                    remainingMs: research.active.remainingMs
                }
                : undefined,
            completed: [...(research?.completed ?? [])]
        });
        const stock = state.factoryStock.get(cityId);
        if (!stock) {
            continue;
        }
        for (const [itemType, itemStock] of stock.entries()) {
            emitter.emitTo(socketId, "factory.stock", {
                cityId,
                itemType,
                stock: itemStock
            });
        }
    }
};

export const emitJoinWorldHydration = (context: DispatchContext, socketId: string): void => {
    const { state, config, emitter } = context;
    const cityIds = new Set<number>();
    for (let cityId = 0; cityId < config.cityCount; cityId += 1) {
        cityIds.add(cityId);
    }
    for (const cityId of state.cities.keys()) {
        cityIds.add(cityId);
    }
    const sortedCityIds = [...cityIds].sort((left, right) => left - right);

    emitHydrationEntities(state, emitter, socketId);
    emitHydrationCityState(state, config, emitter, socketId, sortedCityIds);

    emitter.emitTo(socketId, "players.snapshot", buildPlayersSnapshot(state));
};
