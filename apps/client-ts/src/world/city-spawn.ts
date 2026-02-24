const TILE_SIZE = 48;
const COMMAND_CENTER_WIDTH_TILES = 3;
const COMMAND_CENTER_HEIGHT_TILES = 2;
const COMMAND_CENTER_FRONT_OFFSET = TILE_SIZE / 2;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const PLAYER_SPAWN_ADJUST_X = 6.5;
const PLAYER_SPAWN_ADJUST_Y = 5.5;

type CitySpawn = {
    cityId: number;
    name: string;
    tileX: number;
    tileY: number;
    x: number;
    y: number;
};

const LEGACY_CITY_SPAWNS: ReadonlyArray<{
    cityId: number;
    name: string;
    tileX: number;
    tileY: number;
}> = [
    { cityId: 0, name: "Balkh", tileX: 31, tileY: 31 },
    { cityId: 1, name: "Iqaluit", tileX: 95, tileY: 31 },
    { cityId: 2, name: "Reykjavik", tileX: 159, tileY: 31 },
    { cityId: 3, name: "Jumarity", tileX: 223, tileY: 31 },
    { cityId: 4, name: "Helsinki", tileX: 287, tileY: 31 },
    { cityId: 5, name: "Copenhagen", tileX: 351, tileY: 31 },
    { cityId: 6, name: "Kiev", tileX: 415, tileY: 31 },
    { cityId: 7, name: "Barentsburg", tileX: 479, tileY: 31 }
];

const toSpawn = (entry: {
    cityId: number;
    name: string;
    tileX: number;
    tileY: number;
}): CitySpawn => {
    const baseX = entry.tileX * TILE_SIZE;
    const baseY = entry.tileY * TILE_SIZE;
    const centerX = baseX + (COMMAND_CENTER_WIDTH_TILES * TILE_SIZE) / 2;
    const centerY = baseY + (COMMAND_CENTER_HEIGHT_TILES * TILE_SIZE) + COMMAND_CENTER_FRONT_OFFSET;
    return {
        cityId: entry.cityId,
        name: entry.name,
        tileX: entry.tileX,
        tileY: entry.tileY,
        x: centerX - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_X,
        y: centerY - PLAYER_SPRITE_HALF - PLAYER_SPAWN_ADJUST_Y
    };
};

export const resolveCitySpawn = (cityId: number): CitySpawn | null => {
    if (!Number.isFinite(cityId)) {
        return null;
    }
    const normalized = Math.max(0, Math.floor(cityId));
    const entry = LEGACY_CITY_SPAWNS.find((candidate) => candidate.cityId === normalized);
    return entry ? toSpawn(entry) : null;
};

