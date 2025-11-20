const assert = require('assert');
const CityManager = require('../src/CityManager');
const BuildingFactory = require('../src/BuildingFactory');
const PlayerFactory = require('../src/PlayerFactory');
const { ITEM_TYPES } = require('../src/items');
const { COST_BUILDING } = require('../src/constants');

// Mock Game and IO
const mockIo = {
    emit: () => { },
    sockets: { sockets: new Map() }
};

const mockGame = {
    players: {},
    cities: [],
    buildingFactory: null
};

// Helper to create a mock socket
const createMockSocket = (id) => ({
    id,
    emit: (event, payload) => {
        // console.log(`[Socket ${id}] Emitted ${event}:`, payload);
    },
    broadcast: {
        emit: () => { }
    }
});

async function runTests() {
    console.log('Starting Security Verification Tests...');

    // --- Setup ---
    const cityManager = new CityManager(mockGame);
    cityManager.setIo(mockIo);

    const buildingFactory = new BuildingFactory(mockGame);
    buildingFactory.cityManager = cityManager;
    mockGame.buildingFactory = buildingFactory;

    const playerFactory = new PlayerFactory(mockGame);
    playerFactory.io = mockIo;

    // --- Test 1: Economy (Deficit Spending) ---
    console.log('Test 1: Economy (Deficit Spending)...');
    const cityId = 0;
    const city = cityManager.ensureCity(cityId);
    city.cash = 0; // Set cash to 0

    const researchResult = cityManager.spendForResearch(cityId, 1000);
    assert.strictEqual(researchResult, false, 'Should return false for insufficient funds');
    assert.strictEqual(city.cash, 0, 'Cash should remain 0');
    assert.strictEqual(city.research, 0, 'Research should not increase');
    console.log('PASS');

    // --- Test 2: Inventory Limits (Factory Hoarding) ---
    console.log('Test 2: Inventory Limits (Factory Hoarding)...');
    const socketId = 'player1';
    const socket = createMockSocket(socketId);

    // Setup player inventory
    const playerInventory = cityManager.ensurePlayerInventory(socketId, cityId);
    const itemType = ITEM_TYPES.MEDKIT;
    playerInventory.items.set(itemType, 5); // Max inventory (assuming 5 is limit)

    // Attempt to pick up more
    const pickedUp = cityManager.recordInventoryPickup(socketId, cityId, itemType, 1);
    assert.strictEqual(pickedUp, 0, 'Should pick up 0 items when inventory is full');
    assert.strictEqual(playerInventory.items.get(itemType), 5, 'Inventory should remain at max');
    console.log('PASS');

    // --- Test 3: Item Usage (Infinite Usage) ---
    console.log('Test 3: Item Usage (Infinite Usage)...');
    mockGame.players[socketId] = {
        id: socketId,
        city: cityId,
        health: 10,
        offset: { x: 100, y: 100 }
    };

    // Ensure 0 inventory
    playerInventory.items.set(itemType, 0);

    // Attempt to use item
    playerFactory.handleItemUse(socket, { type: 'medkit' });

    assert.strictEqual(mockGame.players[socketId].health, 10, 'Health should not increase without item');
    console.log('PASS');

    // --- Test 4: Building Placement (Collision & Chain) ---
    console.log('Test 4: Building Placement (Collision & Chain)...');
    mockGame.players[socketId].isMayor = true;
    city.cash = (COST_BUILDING * 10) + 1000; // Give enough cash for multiple buildings

    // 4a. Place Command Center (Root) - Should succeed
    const ccData = {
        id: 'cc',
        type: 0, // Command Center
        x: 100,
        y: 100,
        city: cityId
    };
    buildingFactory.handleNewBuilding(socket, ccData);
    assert.ok(buildingFactory.buildings.has('cc'), 'Command Center should be placed');

    // 4b. Place Building Far Away - Should fail
    const farBuildingData = {
        id: 'far',
        type: 1, // Factory
        x: 2000, // > 20 tiles away
        y: 2000,
        city: cityId
    };
    let deniedReason = null;
    socket.emit = (event, payload) => {
        if (event === 'build:denied') {
            deniedReason = JSON.parse(payload).reason;
        }
    };

    buildingFactory.handleNewBuilding(socket, farBuildingData);
    assert.strictEqual(deniedReason, 'too_far', 'Should deny building too far away');
    assert.ok(!buildingFactory.buildings.has('far'), 'Far building should not be placed');

    // 4c. Place Building On Top - Should fail
    const collisionData = {
        id: 'collide',
        type: 1,
        x: 100, // Same as CC
        y: 100,
        city: cityId
    };
    deniedReason = null;
    buildingFactory.handleNewBuilding(socket, collisionData);
    assert.strictEqual(deniedReason, 'collision', 'Should deny colliding building');
    assert.ok(!buildingFactory.buildings.has('collide'), 'Colliding building should not be placed');

    console.log('PASS');
    // --- Test 5: Authoritative Bullets ---
    console.log('Test 5: Authoritative Bullets...');
    const bulletPayload = {
        x: 9999, // Malicious X
        y: 9999, // Malicious Y
        angle: 0,
        type: 0
    };

    // Mock socket for bullet test
    const bulletSocket = {
        id: socketId,
        on: (event, callback) => {
            if (event === 'request_fire') {
                callback(JSON.stringify(bulletPayload));
            }
        },
        emit: (event, payload) => {
            if (event === 'bullet_shot') {
                const data = JSON.parse(payload);
                // Verify bullet spawned at player position (approx 100, 100 + offset), not 9999, 9999
                const playerX = mockGame.players[socketId].offset.x;
                const playerY = mockGame.players[socketId].offset.y;

                // Allow some margin for muzzle offset calculation
                const isNearPlayer = Math.abs(data.x - playerX) < 100 && Math.abs(data.y - playerY) < 100;
                const isMalicious = Math.abs(data.x - 9999) < 10;

                assert.strictEqual(isNearPlayer, true, 'Bullet should spawn near player');
                assert.strictEqual(isMalicious, false, 'Bullet should NOT spawn at malicious coordinates');
                console.log('PASS');
            }
        }
    };

    // Manually trigger handleRequestFire
    mockGame.bulletFactory = new (require('../src/BulletFactory'))(mockGame, playerFactory);
    mockGame.bulletFactory.io = { emit: bulletSocket.emit }; // Mock IO
    mockGame.bulletFactory.handleRequestFire(bulletSocket, JSON.stringify(bulletPayload));

    console.log('PASS');

    // --- Test 6: Movement Validation (Speed Hack & Collision) ---
    console.log('Test 6: Movement Validation...');

    // Setup Map for collision
    mockGame.map = new Array(512).fill(0).map(() => new Array(512).fill(0));
    // Place a wall at 105, 100 (Player is at 100, 100)
    // TILE_SIZE is 48. Player is at 100,100.
    // Let's place a wall at 200, 100 to block movement to the right.
    // 200 / 48 = 4.16. Tile x=4.
    mockGame.map[4][2] = 1; // Brick wall at x=4, y=2 (approx 192, 96)

    // 6a. Speed Hack
    const speedHackPayload = {
        id: socketId,
        sequence: 1,
        offset: { x: 1000, y: 100 }, // Teleport far away
        direction: 0,
        isMoving: 1
    };

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

    // Reset player
    mockGame.players[socketId].lastUpdateAt = Date.now();
    mockGame.players[socketId].offset = { x: 100, y: 100 };

    // Trigger update
    playerFactory.handlePlayerUpdate(socket, speedHackPayload);

    assert.strictEqual(rejectedReason, 'movement/exceeds_threshold', 'Should reject speed hack');
    assert.deepStrictEqual(forcedPosition, { x: 100, y: 100 }, 'Should force reset to original position');

    // 6b. Collision (Wall)
    // Try to move into the wall at x=192
    // Player at 100. Move to 192. Distance 92.
    // Max move per frame is small, so we simulate a small move INTO a wall.
    // Let's place player right next to wall.
    mockGame.players[socketId].offset = { x: 190, y: 96 }; // Wall is at 192
    mockGame.players[socketId].lastUpdateAt = Date.now();

    const collisionPayload = {
        id: socketId,
        sequence: 2,
        offset: { x: 195, y: 96 }, // Move 5 pixels right, into wall
        direction: 8, // Right
        isMoving: 1
    };

    rejectedReason = null;
    forcedPosition = null;

    playerFactory.handlePlayerUpdate(socket, collisionPayload);

    // Note: PlayerStateValidator checks map collision.
    // 195 + 8 (sprite gap) = 203.
    // Tile 203 / 48 = 4.22 -> Index 4.
    // map[4][2] is 1 (Brick). Should collide.

    assert.strictEqual(rejectedReason, 'movement/collision', 'Should reject collision');
    assert.deepStrictEqual(forcedPosition, { x: 190, y: 96 }, 'Should force reset to pre-collision position');

    console.log('PASS');

    console.log('All Security Tests Passed!');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
