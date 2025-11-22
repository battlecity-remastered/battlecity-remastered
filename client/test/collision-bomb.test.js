import test from 'node:test';
import assert from 'node:assert/strict';

import { checkItems } from '../src/collision/collision-helpers.js';
import { ITEM_TYPE_BOMB, COLLISION_BLOCKING } from '../src/constants.js';

test('checkItems: bombs should not block player movement', () => {
    // Setup: Create a mock game state with a bomb item
    const mockGame = {
        player: {
            city: 0,
            collidedItem: null
        },
        itemFactory: {
            getHead: () => {
                return {
                    x: 100,
                    y: 100,
                    type: ITEM_TYPE_BOMB,
                    active: true,
                    armed: true,
                    next: null
                };
            }
        }
    };

    // Create a player rect that overlaps the bomb at (100, 100)
    const playerRect = {
        x: 100,
        y: 100,
        w: 32,
        h: 32
    };

    // Action: Check collision
    const result = checkItems(mockGame, playerRect);

    // Assert: Should NOT return COLLISION_BLOCKING
    // Bombs should be passable like orbs
    assert.notEqual(result, COLLISION_BLOCKING, 'Bombs should not block player movement');
    assert.equal(result, false, 'checkItems should return false for bombs');

    // The collidedItem should still be set for contextual logic
    assert.equal(mockGame.player.collidedItem?.type, ITEM_TYPE_BOMB, 'collidedItem should be set to the bomb');
});

test('checkItems: unarmed bombs should not block player movement', () => {
    const mockGame = {
        player: {
            city: 0,
            collidedItem: null
        },
        itemFactory: {
            getHead: () => {
                return {
                    x: 200,
                    y: 200,
                    type: ITEM_TYPE_BOMB,
                    active: false,  // Unarmed
                    armed: false,
                    next: null
                };
            }
        }
    };

    const playerRect = {
        x: 200,
        y: 200,
        w: 32,
        h: 32
    };

    const result = checkItems(mockGame, playerRect);

    assert.notEqual(result, COLLISION_BLOCKING, 'Unarmed bombs should not block player movement');
    assert.equal(result, false, 'checkItems should return false for unarmed bombs');
});

test('checkItems: player can drive over multiple bombs', () => {
    const mockGame = {
        player: {
            city: 0,
            collidedItem: null
        },
        itemFactory: {
            getHead: () => {
                // Chain of two bombs
                return {
                    x: 300,
                    y: 300,
                    type: ITEM_TYPE_BOMB,
                    active: true,
                    armed: true,
                    next: {
                        x: 350,
                        y: 300,
                        type: ITEM_TYPE_BOMB,
                        active: true,
                        armed: true,
                        next: null
                    }
                };
            }
        }
    };

    // Player overlapping first bomb
    const playerRect1 = {
        x: 300,
        y: 300,
        w: 32,
        h: 32
    };

    const result1 = checkItems(mockGame, playerRect1);
    assert.equal(result1, false, 'First bomb should not block');

    // Player overlapping second bomb
    const playerRect2 = {
        x: 350,
        y: 300,
        w: 32,
        h: 32
    };

    const result2 = checkItems(mockGame, playerRect2);
    assert.equal(result2, false, 'Second bomb should not block');
});
