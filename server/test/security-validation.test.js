const test = require('node:test');
const assert = require('assert');
const CityManager = require('../src/CityManager');
const BuildingFactory = require('../src/BuildingFactory');
const PlayerFactory = require('../src/PlayerFactory');
const BulletFactory = require('../src/BulletFactory');
const { ITEM_TYPES } = require('../src/items');
const { COST_BUILDING } = require('../src/constants');

const mockIo = {
    emit: () => {},
    sockets: { sockets: new Map() }
};

const createMockSocket = (id) => ({
    id,
    emit: () => {},
    broadcast: { emit: () => {} },
    on: () => {}
});

const createGameContext = () => {
    const game = {
        players: {},
        cities: [],
        buildingFactory: null,
        cityManager: null,
        map: null
    };
    const cityManager = new CityManager(game);
    cityManager.setIo(mockIo);

    const buildingFactory = new BuildingFactory(game);
    buildingFactory.cityManager = cityManager;
    game.buildingFactory = buildingFactory;
    game.cityManager = cityManager;

    const playerFactory = new PlayerFactory(game);
    playerFactory.io = mockIo;

    return { game, cityManager, buildingFactory, playerFactory };
};

test('Economy rejects deficit research spending', () => {
    const { cityManager } = createGameContext();
    const cityId = 0;
    const city = cityManager.ensureCity(cityId);
    city.cash = 0;

    const result = cityManager.spendForResearch(cityId, 1000);
    assert.strictEqual(result, false);
    assert.strictEqual(city.cash, 0);
    assert.strictEqual(city.research, 0);
});

test('Inventory caps block factory hoarding', () => {
    const { cityManager } = createGameContext();
    const cityId = 0;
    const socketId = 'player1';
    const inventory = cityManager.ensurePlayerInventory(socketId, cityId);
    const itemType = ITEM_TYPES.MEDKIT;
    inventory.items.set(itemType, 5);

    const pickedUp = cityManager.recordInventoryPickup(socketId, cityId, itemType, 1);
    assert.strictEqual(pickedUp, 0);
    assert.strictEqual(inventory.items.get(itemType), 5);
});

test('Items cannot be used without stock', () => {
    const { game, cityManager, playerFactory } = createGameContext();
    const cityId = 0;
    const socketId = 'player1';
    const socket = createMockSocket(socketId);
    cityManager.ensurePlayerInventory(socketId, cityId).items.set(ITEM_TYPES.MEDKIT, 0);
    game.players[socketId] = { id: socketId, city: cityId, health: 10, offset: { x: 100, y: 100 } };

    playerFactory.handleItemUse(socket, { type: 'medkit' });
    assert.strictEqual(game.players[socketId].health, 10);
});

test('Building placement validates chain distance and collisions', () => {
    const { game, cityManager, buildingFactory } = createGameContext();
    const cityId = 0;
    const socketId = 'player1';
    const socket = createMockSocket(socketId);
    const city = cityManager.ensureCity(cityId);
    city.cash = (COST_BUILDING * 10) + 1000;
    game.players[socketId] = { id: socketId, city: cityId, isMayor: true };

    // Place root command center (should succeed)
    buildingFactory.handleNewBuilding(socket, { id: 'cc', type: 0, x: 100, y: 100, city: cityId });
    assert.ok(buildingFactory.buildings.has('cc'));

    // Attempt a far building within bounds but beyond chain limit
    let deniedReason = null;
    socket.emit = (event, payload) => {
        if (event === 'build:denied') {
            deniedReason = JSON.parse(payload).reason;
        }
    };
    buildingFactory.handleNewBuilding(socket, { id: 'far', type: 1, x: 200, y: 200, city: cityId });
    assert.strictEqual(deniedReason, 'too_far');
    assert.ok(!buildingFactory.buildings.has('far'));

    // Attempt a colliding building
    deniedReason = null;
    buildingFactory.handleNewBuilding(socket, { id: 'collide', type: 1, x: 100, y: 100, city: cityId });
    assert.strictEqual(deniedReason, 'collision');
    assert.ok(!buildingFactory.buildings.has('collide'));
});

test('Bullet requests are re-centered on the player', () => {
    const { game, playerFactory } = createGameContext();
    const socketId = 'player1';
    const socket = {
        id: socketId,
        on: (event, handler) => {
            if (event === 'request_fire') {
                handler(JSON.stringify({ x: 9999, y: 9999, angle: 0, type: 0 }));
            }
        }
    };

    game.players[socketId] = { id: socketId, city: 0, offset: { x: 100, y: 100 } };
    playerFactory.io = mockIo;
    const bulletFactory = new BulletFactory(game, playerFactory);
    game.bulletFactory = bulletFactory;

    let emittedShot = null;
    bulletFactory.io = {
        emit: (_event, payload) => {
            emittedShot = JSON.parse(payload);
        }
    };

    bulletFactory.handleRequestFire(socket, JSON.stringify({ x: 9999, y: 9999, angle: 0, type: 0 }));

    assert.ok(emittedShot);
    const playerX = game.players[socketId].offset.x;
    const playerY = game.players[socketId].offset.y;
    assert.ok(Math.abs(emittedShot.x - playerX) < 100);
    assert.ok(Math.abs(emittedShot.y - playerY) < 100);
    assert.ok(Math.abs(emittedShot.x - 9999) > 10);
    assert.ok(Math.abs(emittedShot.y - 9999) > 10);
});

test('Movement validation rejects speed hacks and collisions', () => {
    const { game, playerFactory } = createGameContext();
    const socketId = 'player1';
    const socket = createMockSocket(socketId);
    game.players[socketId] = { id: socketId, city: 0, offset: { x: 100, y: 100 }, lastUpdateAt: Date.now() };

    // Build a simple map with a wall
    game.map = Array.from({ length: 512 }, () => new Array(512).fill(0));
    game.map[4][2] = 1; // wall near x~192px, y~96px

    let rejectedReason = null;
    let forcedPosition = null;
    socket.emit = (event, payload) => {
        if (event === 'player:rejected') {
            rejectedReason = JSON.parse(payload).reasons[0];
        }
        if (event === 'player') {
            forcedPosition = JSON.parse(payload).offset;
        }
    };

    // Speed hack: teleport far away
    playerFactory.handlePlayerUpdate(socket, {
        id: socketId,
        sequence: 1,
        offset: { x: 1000, y: 100 },
        direction: 0,
        isMoving: 1
    });
    assert.strictEqual(rejectedReason, 'movement/exceeds_threshold');
    assert.deepStrictEqual(forcedPosition, { x: 100, y: 100 });

    // Collision: walk into a wall tile
    rejectedReason = null;
    forcedPosition = null;
    game.players[socketId].offset = { x: 190, y: 96 };
    game.players[socketId].lastUpdateAt = Date.now();

    playerFactory.handlePlayerUpdate(socket, {
        id: socketId,
        sequence: 2,
        offset: { x: 195, y: 96 },
        direction: 8,
        isMoving: 1
    });
    assert.strictEqual(rejectedReason, 'movement/collision');
    assert.deepStrictEqual(forcedPosition, { x: 190, y: 96 });
});
