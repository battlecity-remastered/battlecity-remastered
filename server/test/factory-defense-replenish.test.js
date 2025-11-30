"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const BuildingFactory = require('../src/BuildingFactory');
const FactoryBuilding = require('../src/FactoryBuilding');
const DefenseManager = require('../src/DefenseManager');
const { POPULATION_MAX_NON_HOUSE, FACTORY_ITEM_LIMITS } = require('../src/constants');
const { ITEM_TYPES } = require('../src/items');

process.on('uncaughtException', (error) => {
    console.error('uncaughtException in test', error);
});

process.on('unhandledRejection', (reason) => {
    console.error('unhandledRejection in test', reason);
});

test('factories resume production after defenses are destroyed without refunding inventory', () => {
    const game = { tick: 100, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    buildingFactory.cityManager.ensureCity(1);

    const playerFactory = {
        getPlayer: (id) => {
            if (id === 'enemy1') {
                return { id, city: 2 };
            }
            return { id: id || 'player1', city: 1 };
        }
    };
    const defenseManager = new DefenseManager({ game, playerFactory });
    buildingFactory.setManagers({ defenseManager });

    // Research building to satisfy production requirement
    const researchBuilding = {
        id: 'research1',
        type: 409,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 5,
        y: 5,
        attachments: [],
    };

    const factoryBuildingData = {
        id: 'factory1',
        type: 109,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
    };

    buildingFactory.buildings.set(researchBuilding.id, researchBuilding);
    buildingFactory.buildings.set(factoryBuildingData.id, factoryBuildingData);

    const factory = new FactoryBuilding(game, factoryBuildingData);

    const limit = FACTORY_ITEM_LIMITS[factoryBuildingData.type];
    for (let i = 0; i < limit; i += 1) {
        defenseManager.addDefense({
            id: `def_${i}`,
            type: ITEM_TYPES.TURRET,
            cityId: 1,
            teamId: 1,
            ownerId: 'player1',
            x: i * 10,
            y: 0,
        }, { broadcast: false });
    }

    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };

    // At cap, factory should not produce
    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0);

    // Destroy one defense; inventory should not be refunded
    defenseManager.handleRemove({ id: 'player1' }, { id: 'def_0', reason: 'destroyed' });

    const outstandingAfterDestruction = buildingFactory.getCityOutstandingItemCount(1, ITEM_TYPES.TURRET);
    assert.strictEqual(outstandingAfterDestruction, limit - 1);
    assert.strictEqual(buildingFactory.cityManager.getInventoryCount(1, ITEM_TYPES.TURRET), 0);

    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(producedIcons.length, 1, 'factory should resume production after destruction');
});

test('enemy can report destroyed defenses; production resumes', () => {
    const game = { tick: 100, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    buildingFactory.cityManager.ensureCity(1);

    const playerFactory = {
        getPlayer: (id) => {
            if (id === 'enemy1') {
                return { id, city: 2 };
            }
            return { id: id || 'player1', city: 1 };
        }
    };
    const defenseManager = new DefenseManager({ game, playerFactory });
    buildingFactory.setManagers({ defenseManager });

    const researchBuilding = {
        id: 'research1',
        type: 409,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 5,
        y: 5,
        attachments: [],
    };

    const factoryBuildingData = {
        id: 'factory1',
        type: 109,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
    };

    buildingFactory.buildings.set(researchBuilding.id, researchBuilding);
    buildingFactory.buildings.set(factoryBuildingData.id, factoryBuildingData);

    const factory = new FactoryBuilding(game, factoryBuildingData);
    const limit = FACTORY_ITEM_LIMITS[factoryBuildingData.type];

    for (let i = 0; i < limit; i += 1) {
        defenseManager.addDefense({
            id: `def_hostile_${i}`,
            type: ITEM_TYPES.TURRET,
            cityId: 1,
            teamId: 1,
            ownerId: 'player1',
            x: i * 10,
            y: 0,
        }, { broadcast: false });
    }

    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };

    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0);

    // Enemy reports destruction
    defenseManager.handleRemove({ id: 'enemy1' }, { id: 'def_hostile_0', reason: 'destroyed' });

    const outstandingAfterDestruction = buildingFactory.getCityOutstandingItemCount(1, ITEM_TYPES.TURRET);
    assert.strictEqual(outstandingAfterDestruction, limit - 1);
    assert.strictEqual(buildingFactory.cityManager.getInventoryCount(1, ITEM_TYPES.TURRET), 0);

    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(producedIcons.length, 1, 'factory produces after hostile destruction');
});

test('plasma defenses destroyed are replenished without refunds', () => {
    const game = { tick: 100, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    buildingFactory.cityManager.ensureCity(1);

    const playerFactory = {
        getPlayer: (id) => ({ id: id || 'player1', city: 1 })
    };
    const defenseManager = new DefenseManager({ game, playerFactory });
    buildingFactory.setManagers({ defenseManager });

    const researchBuilding = {
        id: 'research_plasma',
        type: 411,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 2,
        y: 2,
        attachments: [],
    };

    const factoryBuildingData = {
        id: 'factory_plasma',
        type: 111,
        cityId: 1,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
    };

    buildingFactory.buildings.set(researchBuilding.id, researchBuilding);
    buildingFactory.buildings.set(factoryBuildingData.id, factoryBuildingData);

    const factory = new FactoryBuilding(game, factoryBuildingData);
    const limit = FACTORY_ITEM_LIMITS[factoryBuildingData.type];
    for (let i = 0; i < limit; i += 1) {
        defenseManager.addDefense({
            id: `plasma_${i}`,
            type: ITEM_TYPES.PLASMA,
            cityId: 1,
            teamId: 1,
            ownerId: 'player1',
            x: i * 10,
            y: 0,
        }, { broadcast: false });
    }

    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };

    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0);

    // Destroy one plasma; no refund expected
    defenseManager.applyDefenseDamage('plasma_0', 100, { refund: false });

    const outstandingAfterDestruction = buildingFactory.getCityOutstandingItemCount(1, ITEM_TYPES.PLASMA);
    assert.strictEqual(outstandingAfterDestruction, limit - 1);
    assert.strictEqual(buildingFactory.cityManager.getInventoryCount(1, ITEM_TYPES.PLASMA), 0);

    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(producedIcons.length, 1, 'plasma factory produces after destruction');
});
