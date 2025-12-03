"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const BuildingFactory = require('../src/BuildingFactory');
const FactoryBuilding = require('../src/FactoryBuilding');
const { POPULATION_MAX_NON_HOUSE } = require('../src/constants');

const ORB_FACTORY_TYPE = 105;
const ORB_RESEARCH_TYPE = 405;
const PlayerFactory = require('../src/PlayerFactory');

const createPlayerFactory = (game) => {
    const playerFactoryInstance = new PlayerFactory(game, {});
    Object.assign(playerFactoryInstance, {
        getPlayer: (id) => game.players[id],
        getSocket: () => null,
        resolveKillSummary: () => ({}),
        handleDeathScore: () => {},
        hazardManager: null,
        releaseSlot: () => {},
        getPlayerCallsign: () => null,
        emitLobbySnapshot: () => {}
    });
    playerFactoryInstance.game = game;
    playerFactoryInstance.io = null;
    return playerFactoryInstance;
};

test('orb factory resumes production after orb is consumed (cap of one active orb)', () => {
    const game = { tick: 0, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    const cityId = 1;
    buildingFactory.cityManager.ensureCity(cityId);

    // Research building to unlock factory
    const research = {
        id: 'orb_research',
        type: ORB_RESEARCH_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
        attachments: []
    };

    const factoryData = {
        id: 'orb_factory',
        type: ORB_FACTORY_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 5,
        y: 5,
    };

    buildingFactory.buildings.set(research.id, research);
    buildingFactory.buildings.set(factoryData.id, factoryData);
    const factory = new FactoryBuilding(game, factoryData);

    // Simulate existing orb: production should pause
    buildingFactory.cityManager.registerOrbProduced(cityId);
    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };

    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0, 'Factory should not produce while an orb is active');

    // Consume the orb (e.g., city was orbed); production should resume
    buildingFactory.cityManager.consumeOrb(cityId);
    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(producedIcons.length, 1, 'Factory should produce a new orb after active orb is cleared');
});

test('orb is consumed when holder dies, freeing factory to produce again', () => {
    const game = { tick: 0, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    const cityId = 2;
    buildingFactory.cityManager.ensureCity(cityId);

    const playerFactoryInstance = createPlayerFactory(game);
    game.players = { holder: { id: 'holder', city: cityId } };

    // Simulate produced orb and pickup
    buildingFactory.cityManager.registerOrbProduced(cityId);
    buildingFactory.cityManager.registerOrbHolder('holder', cityId);
    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 1, 'Active orb should be registered before death');

    // Factory setup
    const research = {
        id: 'orb_research_2',
        type: ORB_RESEARCH_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
        attachments: []
    };
    const factoryData = {
        id: 'orb_factory_2',
        type: ORB_FACTORY_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 5,
        y: 5,
    };
    buildingFactory.buildings.set(research.id, research);
    buildingFactory.buildings.set(factoryData.id, factoryData);
    const factory = new FactoryBuilding(game, factoryData);

    // While holder alive and active orb present, no production
    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };
    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0, 'Factory should not produce while orb holder is alive with active orb');

    // Kill holder, should consume orb and allow production
    playerFactoryInstance.handlePlayerDeath('holder', game.players.holder, {});
    assert.ok(!game.players.holder, "Player record should be removed on death");
    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 0, 'Active orb count should clear when holder dies');
    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 1, 'Active orb count should reflect newly produced orb after holder death');
    assert.strictEqual(producedIcons.length, 1, 'Factory should produce a new orb after holder death');
});

test('orb is not consumed when a non-holder dies', () => {
    const game = { tick: 0, map: [] };
    const buildingFactory = new BuildingFactory(game);
    game.buildingFactory = buildingFactory;
    const cityId = 3;
    buildingFactory.cityManager.ensureCity(cityId);

    const playerFactoryInstance = createPlayerFactory(game);
    game.players = {
        holder: { id: 'holder', city: cityId },
        victim: { id: 'victim', city: cityId }
    };

    buildingFactory.cityManager.registerOrbProduced(cityId);
    buildingFactory.cityManager.registerOrbHolder('holder', cityId);
    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 1, 'Active orb should be registered before non-holder death');

    const research = {
        id: 'orb_research_3',
        type: ORB_RESEARCH_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 0,
        y: 0,
        attachments: []
    };
    const factoryData = {
        id: 'orb_factory_3',
        type: ORB_FACTORY_TYPE,
        cityId,
        population: POPULATION_MAX_NON_HOUSE,
        x: 5,
        y: 5,
    };
    buildingFactory.buildings.set(research.id, research);
    buildingFactory.buildings.set(factoryData.id, factoryData);
    const factory = new FactoryBuilding(game, factoryData);

    const producedIcons = [];
    const ioStub = { emit: (event, payload) => { if (event === 'new_icon') producedIcons.push(payload); } };
    factory.cycle(buildingFactory, ioStub);
    assert.strictEqual(producedIcons.length, 0, 'Factory should not produce while orb is active for holder');

    playerFactoryInstance.handlePlayerDeath('victim', game.players.victim, {});
    assert.ok(!game.players.victim, "Non-holder should be removed on death");
    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 1, 'Active orb count should stay at one after non-holder death');

    game.tick += 8000;
    factory.cycle(buildingFactory, ioStub);

    assert.strictEqual(buildingFactory.cityManager.getActiveOrbCount(cityId), 1, 'Active orb count should remain when non-holder dies');
    assert.strictEqual(producedIcons.length, 0, 'Factory should remain paused while orb stays active with holder alive');
});
