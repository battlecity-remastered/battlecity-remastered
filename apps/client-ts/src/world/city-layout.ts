import type { ClientState } from "../app/state.js";

export type CityLayoutEntry = {
    cityId: number;
    buildingCount: number;
    defenseCount: number;
    hazardCount: number;
};

export const buildCityLayoutSnapshot = (state: ClientState): CityLayoutEntry[] => {
    const cityIds = new Set<number>();
    for (const building of state.buildings.values()) {
        cityIds.add(building.cityId);
    }
    for (const defense of state.defenses.values()) {
        cityIds.add(defense.cityId);
    }
    for (const hazard of state.hazards.values()) {
        cityIds.add(hazard.cityId);
    }

    return [...cityIds].sort((left, right) => left - right).map((cityId) => {
        let buildingCount = 0;
        let defenseCount = 0;
        let hazardCount = 0;
        for (const building of state.buildings.values()) {
            if (building.cityId === cityId) {
                buildingCount += 1;
            }
        }
        for (const defense of state.defenses.values()) {
            if (defense.cityId === cityId) {
                defenseCount += 1;
            }
        }
        for (const hazard of state.hazards.values()) {
            if (hazard.cityId === cityId) {
                hazardCount += 1;
            }
        }
        return {
            cityId,
            buildingCount,
            defenseCount,
            hazardCount
        };
    });
};
