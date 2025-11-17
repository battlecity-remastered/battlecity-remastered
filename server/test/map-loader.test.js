const test = require('node:test');
const assert = require('node:assert/strict');

const { loadMapData } = require('../src/utils/mapLoader');
const citySpawns = require('../../shared/citySpawns.json');

const MAP_SQUARE_BUILDING = 3;

const requireCityTile = (map, cityId, description) => {
  const spawn = citySpawns[String(cityId)];
  assert.ok(spawn, `Missing city spawn data for ${description}`);
  const { tileX, tileY } = spawn;
  assert.strictEqual(
    map[tileX][tileY],
    MAP_SQUARE_BUILDING,
    `${description} should occupy (${tileX}, ${tileY})`
  );
};

test('map loader keeps corner cities oriented correctly', () => {
  const { map } = loadMapData();
  assert.ok(Array.isArray(map) && map.length > 0, 'loadMapData should return the decoded map');

  requireCityTile(map, 0, 'Balkh (north-west)');
  requireCityTile(map, 56, 'Tirana (south-west)');
  requireCityTile(map, 63, 'Admin Inn (south-east)');
});
