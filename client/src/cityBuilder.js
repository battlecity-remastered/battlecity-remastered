import {DEFAULT_CITY_CAN_BUILD} from "./constants";
import {MONEY_STARTING_VALUE} from "./constants";
import citySpawns from '@shared/citySpawns.json' with { type: "json" };
import fakeCityConfig from '@shared/fakeCities.json';
import {getCityDisplayName, getCitySpawn} from "./utils/citySpawns";

const createDefaultCanBuild = () => ({ ...DEFAULT_CITY_CAN_BUILD });

const createCityTemplate = () => ({
    canBuild: createDefaultCanBuild(),
    cash: MONEY_STARTING_VALUE,
    income: 0,
    itemProduction: 0,
    research: 0,
    hospital: 0,
    construction: 0,
    grossIncome: 0,
});

function createFakeCity(game) {
    if (!game || !Array.isArray(game.cities)) {
        return;
    }
    const fakeCities = Array.isArray(fakeCityConfig?.cities) ? fakeCityConfig.cities : [];
    fakeCities.forEach((entry) => {
        const cityId = Number(entry?.cityId);
        if (!Number.isFinite(cityId)) {
            return;
        }
        const city = game.cities[cityId];
        if (!city) {
            return;
        }
        if (entry?.name) {
            city.name = entry.name;
        }
        city.isFakeCandidate = true;
    });
}

function createCities(game) {
    game.cities = [];
    Object.keys(citySpawns || {}).forEach((key) => {
        const numericId = Number(key);
        if (!Number.isFinite(numericId)) {
            return;
        }
        const entry = citySpawns[key];
        const spawn = getCitySpawn(numericId);
        const newCity = createCityTemplate();
        newCity.id = numericId;
        const tileX = Number(entry?.tileX);
        const tileY = Number(entry?.tileY);
        const resolvedTileX = Number.isFinite(tileX) ? tileX : (spawn?.tileX ?? 0);
        const resolvedTileY = Number.isFinite(tileY) ? tileY : (spawn?.tileY ?? 0);
        newCity.tileX = resolvedTileX;
        newCity.tileY = resolvedTileY;
        newCity.x = resolvedTileX * 48;
        newCity.y = resolvedTileY * 48;
        newCity.name = getCityDisplayName(numericId);
        game.cities[numericId] = newCity;
    });
}

export const build = (game) => {
    createCities(game);
    createFakeCity(game);
};
