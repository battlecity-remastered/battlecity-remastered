import type { ClientState } from "../app/state.js";
import { applyCityArrival } from "./city-arrival.js";

export const applyArrivalTransition = (state: ClientState, transition: string | null, frame: number): void => {
    if (frame !== 180) return;
    if (transition === "city") { applyCityArrival(state); return; }
    if (transition === "ai") {
        for (let i = 6; i < 10; i++) state.remotePlayers.set(`enemy-${i}`, { id: `enemy-${i}`, city: 2, botRole: "shooter", x: (28 + i) * 48, y: 29 * 48, direction: 8, health: 20, maxHealth: 20 });
        state.buildings.set("arrival-orb-factory", { id: "arrival-orb-factory", ownerId: "ai", cityId: 2, type: 105, tileX: 41, tileY: 35, health: 120, maxHealth: 120, population: 50 });
        state.factoryStock.set(2, new Map([[5, 1]]));
    }
    if (transition === "overflow") {
        for (let city = 10; city < 20; city++) {
            state.buildings.set(`overflow-${city}`, { id: `overflow-${city}`, ownerId: "ai", cityId: city, type: 105, tileX: 41 + city, tileY: 35, health: 120, maxHealth: 120, population: 50 });
            state.factoryStock.set(city, new Map([[5, 1]]));
        }
    }
};
