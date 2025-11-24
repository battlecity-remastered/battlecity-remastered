import { test } from 'node:test';
import assert from 'node:assert';
import SimplePathfinder from '../src/defenders/SimplePathfinder.js';

const TILE_SIZE = 48;

// Create a mock game with a simple map
function createMockGame() {
    const map = [];
    for (let x = 0; x < 10; x++) {
        map[x] = [];
        for (let y = 0; y < 10; y++) {
            map[x][y] = 0; // All grass
        }
    }

    // Add a vertical wall at x=5
    for (let y = 2; y <= 7; y++) {
        map[5][y] = 1;
    }

    return {
        map: map,
        buildingFactory: { getHead: () => null },
        itemFactory: { getHead: () => null }
    };
}

test('Pathfinder finds direct path with no obstacles', () => {
    const game = createMockGame();
    const pathfinder = new SimplePathfinder(game);

    const startX = 1 * TILE_SIZE + TILE_SIZE / 2;
    const startY = 1 * TILE_SIZE + TILE_SIZE / 2;
    const goalX = 8 * TILE_SIZE + TILE_SIZE / 2;
    const goalY = 8 * TILE_SIZE + TILE_SIZE / 2;

    const path = pathfinder.findPath(startX, startY, goalX, goalY);

    assert.ok(path, 'Path should exist');
    assert.ok(path.length > 0, 'Path should have waypoints');

    console.log(`✓ Found path with ${path.length} waypoints`);
});

test('Pathfinder finds path around wall', () => {
    const game = createMockGame();
    const pathfinder = new SimplePathfinder(game);

    // Start left of wall, goal right of wall
    const startX = 3 * TILE_SIZE + TILE_SIZE / 2;
    const startY = 5 * TILE_SIZE + TILE_SIZE / 2;
    const goalX = 7 * TILE_SIZE + TILE_SIZE / 2;
    const goalY = 5 * TILE_SIZE + TILE_SIZE / 2;

    const path = pathfinder.findPath(startX, startY, goalX, goalY);

    assert.ok(path, 'Path should exist');
    assert.ok(path.length > 2, 'Path should go around wall, not direct');

    // Verify path doesn't go through wall at x=5
    for (const waypoint of path) {
        const tileX = Math.floor(waypoint.x / TILE_SIZE);
        const tileY = Math.floor(waypoint.y / TILE_SIZE);

        assert.ok(
            !(tileX === 5 && tileY >= 2 && tileY <= 7),
            `Path should not go through wall at (${tileX},${tileY})`
        );
    }

    console.log(`✓ Found path around wall with ${path.length} waypoints`);
});

test('Pathfinder avoids buildings', () => {
    const game = createMockGame();

    // Add a 3x3 building
    const building = { x: 4, y: 4, next: null };
    game.buildingFactory.getHead = () => building;

    const pathfinder = new SimplePathfinder(game);

    const startX = 2 * TILE_SIZE + TILE_SIZE / 2;
    const startY = 5 * TILE_SIZE + TILE_SIZE / 2;
    const goalX = 8 * TILE_SIZE + TILE_SIZE / 2;
    const goalY = 5 * TILE_SIZE + TILE_SIZE / 2;

    const path = pathfinder.findPath(startX, startY, goalX, goalY);

    assert.ok(path, 'Path should exist');

    // Verify no waypoint goes through the building (tiles 4-6, 4-6)
    for (const waypoint of path) {
        const tileX = Math.floor(waypoint.x / TILE_SIZE);
        const tileY = Math.floor(waypoint.y / TILE_SIZE);

        assert.ok(
            !(tileX >= 4 && tileX < 7 && tileY >= 4 && tileY < 7),
            `Path should not go through building at (${tileX},${tileY})`
        );
    }

    console.log(`✓ Found path around building with ${path.length} waypoints`);
});

test('Pathfinder returns null for blocked goal', () => {
    const game = createMockGame();
    const pathfinder = new SimplePathfinder(game);

    const startX = 1 * TILE_SIZE + TILE_SIZE / 2;
    const startY = 1 * TILE_SIZE + TILE_SIZE / 2;
    // Goal is on the wall
    const goalX = 5 * TILE_SIZE + TILE_SIZE / 2;
    const goalY = 5 * TILE_SIZE + TILE_SIZE / 2;

    const path = pathfinder.findPath(startX, startY, goalX, goalY);

    assert.strictEqual(path, null, 'Path should be null when goal is blocked');

    console.log(`✓ Correctly returned null for blocked goal`);
});
