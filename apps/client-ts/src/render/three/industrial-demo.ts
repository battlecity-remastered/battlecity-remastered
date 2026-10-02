import type { LoadedMap } from "../../world/map-loader.js";

export type IndustrialBuilding = {
    kind: "factory" | "orb-factory" | "research";
    type: number;
    tileX: number;
    tileY: number;
};

// Indexes match the DX inventory and factory building IDs (100 + item type).
export const FACTORY_PRODUCTS = ["cloak", "rocket", "medkit", "bomb", "mine", "orb", "flare", "dfg", "wall", "turret", "sleeper", "plasma", "laser"] as const;

export const factoryProduct = (building: IndustrialBuilding): typeof FACTORY_PRODUCTS[number] | undefined =>
    building.kind === "research" ? undefined : FACTORY_PRODUCTS[building.type - 100];

// Dry sites around Balkh, with roads between the original three-tile plots.
// Type 105 is the original orb factory (item 5), not an invented building type.
const DISTRICT: ReadonlyArray<IndustrialBuilding> = [
    { kind: "factory", type: 101, tileX: 26, tileY: 31 },
    { kind: "orb-factory", type: 105, tileX: 36, tileY: 31 },
    { kind: "factory", type: 104, tileX: 26, tileY: 26 },
    { kind: "research", type: 401, tileX: 30, tileY: 24 },
    { kind: "research", type: 404, tileX: 36, tileY: 26 },
    { kind: "factory", type: 103, tileX: 21, tileY: 31 },
    { kind: "factory", type: 109, tileX: 41, tileY: 31 },
    { kind: "factory", type: 111, tileX: 41, tileY: 26 },
    { kind: "factory", type: 112, tileX: 21, tileY: 26 },
    { kind: "factory", type: 110, tileX: 26, tileY: 21 },
    { kind: "factory", type: 107, tileX: 31, tileY: 19 },
    { kind: "factory", type: 108, tileX: 41, tileY: 21 },
    { kind: "factory", type: 100, tileX: 26, tileY: 16 },
    { kind: "factory", type: 102, tileX: 31, tileY: 14 },
    { kind: "factory", type: 106, tileX: 41, tileY: 16 }
];

export const createIndustrialDemoLayout = (data: LoadedMap): IndustrialBuilding[] => {
    const buildings: IndustrialBuilding[] = [];
    for (const building of DISTRICT) {
        const { tileX, tileY, kind } = building;
        let clear = true;
        for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
            const x = tileX + dx, y = tileY + dy;
            if (data.map[x]?.[y] !== 0 || data.buildBlockingTiles.has(`${x},${y}`)) clear = false;
        }
        if (!clear) continue;
        buildings.push({ ...building });
        for (let dx = 0; dx < 3; dx++) for (let dy = 0; dy < 3; dy++) {
            const key = `${tileX + dx},${tileY + dy}`;
            data.buildBlockingTiles.add(key);
            // Factories retain their walkable dispatch/pickup row.
            if (kind === "research" || dy < 2) data.blockingTiles.add(key);
        }
    }
    return buildings;
};

export type DemoDefense = { tileX: number; tileY: number };
export const createDefenseDemoLayout = (data: LoadedMap): DemoDefense[] => {
    const candidates: DemoDefense[] = [{tileX:24,tileY:29},{tileX:35,tileY:33},{tileX:39,tileY:29},{tileX:30,tileY:29}];
    return candidates.filter(({tileX,tileY})=> {
        const key=`${tileX},${tileY}`;
        if(data.map[tileX]?.[tileY]!==0 || data.buildBlockingTiles.has(key)) return false;
        data.blockingTiles.add(key); data.buildBlockingTiles.add(key);
        return true;
    });
};
