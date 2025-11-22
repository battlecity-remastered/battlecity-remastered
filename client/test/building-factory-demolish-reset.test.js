import test from 'node:test';
import assert from 'node:assert/strict';

import BuildingFactory from '../src/factories/BuildingFactory.js';
import {
    DEFAULT_CITY_CAN_BUILD,
    CAN_BUILD,
    HAS_BUILT,
    CAN_BUILD_LASER_RESEARCH,
} from '../src/constants.js';

const createGame = () => {
    const size = 2;
    const map = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));
    const tiles = Array.from({ length: size }, () => Array.from({ length: size }, () => 0));

    const game = {
        player: { id: 'player', city: 0 },
        cities: [{ canBuild: { ...DEFAULT_CITY_CAN_BUILD } }],
        map,
        tiles,
        explosions: [],
        tick: 0,
        iconFactory: {
            countUnownedIconsNear: () => 0,
            removeUnownedIconsNear: () => {},
        },
        forceDraw: false,
    };
    return game;
};

const createBuildingNode = (type) => ({
    id: 'b1',
    owner: 'player',
    x: 0,
    y: 0,
    type,
    city: 0,
    next: null,
    previous: null,
    itemsLeft: 0,
});

test('demolishing a building resets canBuild state instead of leaving it marked built', () => {
    const game = createGame();
    const factory = new BuildingFactory(game);

    const building = createBuildingNode(CAN_BUILD_LASER_RESEARCH);

    // Seed the factory list with a built structure.
    factory.buildingListHead = building;
    factory.buildingsById[building.id] = building;
    factory.buildingsByCoord[`${building.x}_${building.y}`] = building;

    // Mark the structure as already built.
    factory.markBuildingConstructed(0, building.type);
    assert.equal(game.cities[0].canBuild.CAN_BUILD_LASER_RESEARCH, HAS_BUILT);

    factory.deleteBuilding(building, false);

    assert.equal(factory.getHead(), null, 'building list should be empty after demolition');
    assert.equal(
        game.cities[0].canBuild.CAN_BUILD_LASER_RESEARCH,
        CAN_BUILD,
        'demolition should reset build availability based on dependency ordering'
    );
});
