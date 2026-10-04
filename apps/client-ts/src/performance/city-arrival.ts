import type { ClientState } from "../app/state.js";

// Production CityLayoutService conversion of data/cities/Balkh/demo.city.
// Translate the unchanged 47-building layout offscreen to isolate arrival work.
const layout: ReadonlyArray<{ type: number; dx: number; dy: number }> = [
    {
        "type": 300,
        "dx": 9,
        "dy": -17
    },
    {
        "type": 108,
        "dx": 6,
        "dy": -14
    },
    {
        "type": 110,
        "dx": 9,
        "dy": -14
    },
    {
        "type": 300,
        "dx": 17,
        "dy": 6
    },
    {
        "type": 405,
        "dx": -13,
        "dy": -2
    },
    {
        "type": 111,
        "dx": -6,
        "dy": 1
    },
    {
        "type": 109,
        "dx": -6,
        "dy": -2
    },
    {
        "type": 300,
        "dx": -13,
        "dy": -5
    },
    {
        "type": 411,
        "dx": -13,
        "dy": -8
    },
    {
        "type": 409,
        "dx": -9,
        "dy": -3
    },
    {
        "type": 410,
        "dx": -9,
        "dy": 0
    },
    {
        "type": 408,
        "dx": -9,
        "dy": 3
    },
    {
        "type": 101,
        "dx": 2,
        "dy": -4
    },
    {
        "type": 101,
        "dx": -2,
        "dy": -4
    },
    {
        "type": 300,
        "dx": 13,
        "dy": -12
    },
    {
        "type": 300,
        "dx": 15,
        "dy": -9
    },
    {
        "type": 300,
        "dx": 15,
        "dy": -6
    },
    {
        "type": 401,
        "dx": 12,
        "dy": -9
    },
    {
        "type": 403,
        "dx": 12,
        "dy": -6
    },
    {
        "type": 300,
        "dx": 15,
        "dy": -3
    },
    {
        "type": 300,
        "dx": 15,
        "dy": 0
    },
    {
        "type": 406,
        "dx": 12,
        "dy": -3
    },
    {
        "type": 400,
        "dx": 12,
        "dy": 0
    },
    {
        "type": 300,
        "dx": 12,
        "dy": 3
    },
    {
        "type": 407,
        "dx": 15,
        "dy": 3
    },
    {
        "type": 402,
        "dx": 15,
        "dy": 9
    },
    {
        "type": 300,
        "dx": 14,
        "dy": 6
    },
    {
        "type": 300,
        "dx": 12,
        "dy": 9
    },
    {
        "type": 107,
        "dx": 8,
        "dy": -10
    },
    {
        "type": 102,
        "dx": 8,
        "dy": -7
    },
    {
        "type": 103,
        "dx": 8,
        "dy": -4
    },
    {
        "type": 106,
        "dx": 8,
        "dy": -1
    },
    {
        "type": 100,
        "dx": 8,
        "dy": 2
    },
    {
        "type": 105,
        "dx": 3,
        "dy": 0
    },
    {
        "type": 300,
        "dx": 11,
        "dy": 6
    },
    {
        "type": 101,
        "dx": 3,
        "dy": -7
    },
    {
        "type": 101,
        "dx": 0,
        "dy": -7
    },
    {
        "type": 101,
        "dx": -3,
        "dy": -7
    },
    {
        "type": 101,
        "dx": -7,
        "dy": -6
    },
    {
        "type": 300,
        "dx": 2,
        "dy": -13
    },
    {
        "type": 300,
        "dx": -1,
        "dy": -13
    },
    {
        "type": 300,
        "dx": -4,
        "dy": -13
    },
    {
        "type": 300,
        "dx": -7,
        "dy": -13
    },
    {
        "type": 101,
        "dx": 2,
        "dy": -10
    },
    {
        "type": 101,
        "dx": -1,
        "dy": -10
    },
    {
        "type": 101,
        "dx": -4,
        "dy": -10
    },
    {
        "type": 101,
        "dx": -7,
        "dy": -10
    }
];

export const applyCityArrival = (state: ClientState): void => {
    for (const [index, site] of layout.entries()) {
        const id = `arrival-city-${index}`;
        state.buildings.set(id, { id, ownerId: "ai", cityId: 17, type: site.type, tileX: 100 + site.dx, tileY: 150 + site.dy, health: 120, maxHealth: 120, population: 50 });
    }
    state.factoryStock.set(17, new Map(Array.from({ length: 13 }, (_, type) => [type, 10])));
    for (let index = 6; index < 10; index++) state.remotePlayers.set(`enemy-${index}`, { id: `enemy-${index}`, city: 17, botRole: "shooter", x: (28 + index) * 48, y: 29 * 48, direction: 8, health: 20, maxHealth: 20 });
};
