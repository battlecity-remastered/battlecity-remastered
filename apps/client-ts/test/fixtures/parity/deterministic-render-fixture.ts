import { createClientState, type ClientState } from "../../../src/app/state.js";
import { resolveViewportFromState } from "../../../src/gameplay/world-viewport.js";

export type DeterministicParityFixture = {
    state: ClientState;
    viewport: ReturnType<typeof resolveViewportFromState>;
};

export const createDeterministicParityFixture = (): DeterministicParityFixture => {
    const state = createClientState();

    state.pointer.surfaceWidth = 1024;
    state.pointer.surfaceHeight = 768;
    state.pointer.inside = true;

    state.local.id = "local-player";
    state.local.city = 0;
    state.local.x = 6000;
    state.local.y = 6100;
    state.local.direction = 8;

    state.cityFinance.set(0, {
        cash: 1250,
        income: 200,
        score: 12,
        researchLevel: 1
    });

    const buildingFixtures: Array<ClientState["buildings"] extends Map<string, infer T> ? T : never> = [
        {
            id: "factory-1",
            ownerId: "local-player",
            cityId: 0,
            type: 100,
            tileX: 95,
            tileY: 159,
            health: 100,
            maxHealth: 100,
            population: 40
        },
        {
            id: "research-1",
            ownerId: "local-player",
            cityId: 0,
            type: 200,
            tileX: 98,
            tileY: 159,
            health: 100,
            maxHealth: 100,
            population: 12
        },
        {
            id: "repair-1",
            ownerId: "local-player",
            cityId: 0,
            type: 300,
            tileX: 101,
            tileY: 159,
            health: 100,
            maxHealth: 100,
            population: 20
        },
        {
            id: "house-1",
            ownerId: "local-player",
            cityId: 0,
            type: 400,
            tileX: 104,
            tileY: 159,
            health: 100,
            maxHealth: 100,
            population: 100
        },
        {
            id: "command-center-1",
            ownerId: "local-player",
            cityId: 0,
            type: 500,
            tileX: 107,
            tileY: 159,
            health: 100,
            maxHealth: 100,
            population: 30
        }
    ];

    for (const building of buildingFixtures) {
        state.buildings.set(building.id, building);
    }

    state.defenses.set("turret-1", {
        id: "turret-1",
        cityId: 0,
        type: 9,
        tileX: 102,
        tileY: 163,
        health: 100,
        maxHealth: 100
    });

    const hazardFixtures: Array<ClientState["hazards"] extends Map<string, infer T> ? T : never> = [
        {
            id: "mine-1",
            cityId: 0,
            type: 4,
            x: 4800,
            y: 5000,
            radius: 24
        },
        {
            id: "bomb-1",
            cityId: 0,
            type: 3,
            x: 4900,
            y: 5100,
            radius: 24
        },
        {
            id: "orb-1",
            cityId: 0,
            type: 5,
            x: 5000,
            y: 5200,
            radius: 24
        }
    ];

    for (const hazard of hazardFixtures) {
        state.hazards.set(hazard.id, hazard);
    }

    state.remotePlayers.set("remote-1", {
        id: "remote-1",
        city: 0,
        direction: 4,
        x: 6200,
        y: 6250,
        health: 75,
        maxHealth: 100
    });
    state.remotePlayers.set("remote-2", {
        id: "remote-2",
        city: 1,
        direction: 14,
        x: 6400,
        y: 6050,
        health: 55,
        maxHealth: 100
    });

    return {
        state,
        viewport: resolveViewportFromState(state)
    };
};
