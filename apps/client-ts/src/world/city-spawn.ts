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
    { cityId: 0, name: 'Balkh', tileX: 31, tileY: 31 },
    { cityId: 1, name: 'Iqaluit', tileX: 95, tileY: 31 },
    { cityId: 2, name: 'Reykjavik', tileX: 159, tileY: 31 },
    { cityId: 3, name: 'Jumarity', tileX: 223, tileY: 31 },
    { cityId: 4, name: 'Helsinki', tileX: 287, tileY: 31 },
    { cityId: 5, name: 'Copenhagen', tileX: 351, tileY: 31 },
    { cityId: 6, name: 'Kiev', tileX: 415, tileY: 31 },
    { cityId: 7, name: 'Barentsburg', tileX: 479, tileY: 31 },
    { cityId: 8, name: 'Nunivak', tileX: 31, tileY: 95 },
    { cityId: 9, name: 'Algiers', tileX: 95, tileY: 95 },
    { cityId: 10, name: 'Paga Pago', tileX: 159, tileY: 95 },
    { cityId: 11, name: 'St. Johns', tileX: 223, tileY: 95 },
    { cityId: 12, name: 'Parana', tileX: 287, tileY: 95 },
    { cityId: 13, name: 'San Salvador de Jujuy', tileX: 351, tileY: 95 },
    { cityId: 14, name: 'Tallinn', tileX: 415, tileY: 95 },
    { cityId: 15, name: 'Bergen', tileX: 479, tileY: 95 },
    { cityId: 16, name: 'Bangui', tileX: 31, tileY: 159 },
    { cityId: 17, name: 'Annaba', tileX: 95, tileY: 159 },
    { cityId: 18, name: 'Andorra-la-Vella', tileX: 159, tileY: 159 },
    { cityId: 19, name: 'Bahia Blanca', tileX: 223, tileY: 159 },
    { cityId: 20, name: 'Posadas', tileX: 287, tileY: 159 },
    { cityId: 21, name: 'Santa Fe', tileX: 351, tileY: 159 },
    { cityId: 22, name: 'Buckland', tileX: 415, tileY: 159 },
    { cityId: 23, name: 'Kabul', tileX: 479, tileY: 159 },
    { cityId: 24, name: 'Lahij', tileX: 31, tileY: 223 },
    { cityId: 25, name: 'Banta', tileX: 95, tileY: 223 },
    { cityId: 26, name: 'Benguela', tileX: 159, tileY: 223 },
    { cityId: 27, name: 'Buenos Aires', tileX: 223, tileY: 223 },
    { cityId: 28, name: 'Resistencia', tileX: 287, tileY: 223 },
    { cityId: 29, name: 'Santiago del Estero', tileX: 351, tileY: 223 },
    { cityId: 30, name: 'Armidale', tileX: 415, tileY: 223 },
    { cityId: 31, name: 'Harbin', tileX: 479, tileY: 223 },
    { cityId: 32, name: 'Fajardo', tileX: 31, tileY: 287 },
    { cityId: 33, name: 'Blida', tileX: 95, tileY: 287 },
    { cityId: 34, name: 'Huambo', tileX: 159, tileY: 287 },
    { cityId: 35, name: 'Cordoba', tileX: 223, tileY: 287 },
    { cityId: 36, name: 'Rio Cuarto', tileX: 287, tileY: 287 },
    { cityId: 37, name: 'Kumayari', tileX: 351, tileY: 287 },
    { cityId: 38, name: 'Kuala Lumpur', tileX: 415, tileY: 287 },
    { cityId: 39, name: 'Mango', tileX: 479, tileY: 287 },
    { cityId: 40, name: 'Arequipa', tileX: 31, tileY: 351 },
    { cityId: 41, name: 'Constantine', tileX: 95, tileY: 351 },
    { cityId: 42, name: 'Luanda', tileX: 159, tileY: 351 },
    { cityId: 43, name: 'Corrientes', tileX: 223, tileY: 351 },
    { cityId: 44, name: 'Rosario', tileX: 287, tileY: 351 },
    { cityId: 45, name: 'Kirovakan', tileX: 351, tileY: 351 },
    { cityId: 46, name: 'Jakarta', tileX: 415, tileY: 351 },
    { cityId: 47, name: 'Skopje', tileX: 479, tileY: 351 },
    { cityId: 48, name: 'Bogota', tileX: 31, tileY: 415 },
    { cityId: 49, name: 'Canberra', tileX: 95, tileY: 415 },
    { cityId: 50, name: 'Pretoria', tileX: 159, tileY: 415 },
    { cityId: 51, name: 'Maracay', tileX: 223, tileY: 415 },
    { cityId: 52, name: 'Cambridge', tileX: 287, tileY: 415 },
    { cityId: 53, name: 'Laketown', tileX: 351, tileY: 415 },
    { cityId: 54, name: 'Hanoi', tileX: 415, tileY: 415 },
    { cityId: 55, name: 'Bishkek', tileX: 479, tileY: 415 },
    { cityId: 56, name: 'Tirana', tileX: 31, tileY: 479 },
    { cityId: 57, name: 'Dakar', tileX: 94, tileY: 479 },
    { cityId: 58, name: 'Aquin', tileX: 158, tileY: 479 },
    { cityId: 59, name: 'Bismarck', tileX: 222, tileY: 479 },
    { cityId: 60, name: 'Albany', tileX: 286, tileY: 479 },
    { cityId: 61, name: 'Manukau', tileX: 350, tileY: 479 },
    { cityId: 62, name: 'Utrecht', tileX: 414, tileY: 479 },
    { cityId: 63, name: 'Admin Inn', tileX: 478, tileY: 479 },
];

const LEGACY_CITY_SPAWN_BY_ID = new Map<number, (typeof LEGACY_CITY_SPAWNS)[number]>(
    LEGACY_CITY_SPAWNS.map((entry) => [entry.cityId, entry] as const)
);

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
    const entry = LEGACY_CITY_SPAWN_BY_ID.get(normalized);
    return entry ? toSpawn(entry) : null;
};

export const listCitySpawns = (): ReadonlyArray<CitySpawn> => {
    return LEGACY_CITY_SPAWNS.map((entry) => toSpawn(entry));
};
