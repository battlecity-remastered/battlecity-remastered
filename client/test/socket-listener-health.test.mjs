/**
 * Test: Socket listener health update sets forceDraw flag
 * 
 * This test verifies that when health updates are received from the server,
 * the game.forceDraw flag is set to true, ensuring the UI updates immediately.
 * 
 * Regression guard for: Health update delay issue where UI lagged behind
 * actual health values because forceDraw wasn't triggered.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import SocketListener from '../src/SocketListener.js';

describe('SocketListener health update', () => {
    let mockGame;
    let mockSocketListener;

    beforeEach(async () => {
        mockGame = {
            player: {
                id: 'test-player-123',
                health: 40
            },
            otherPlayers: {},
            forceDraw: false
        };

        // Create a minimal SocketListener mock
        mockSocketListener = new SocketListener(mockGame);
        mockSocketListener.io = { id: 'test-player-123' };
    });

    it('should set forceDraw when local player health is updated', () => {
        const healthUpdate = {
            id: 'test-player-123',
            health: 30,
            previousHealth: 40
        };

        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(healthUpdate);

        assert.equal(mockGame.player.health, 30, 'Player health should be updated');
        assert.equal(mockGame.forceDraw, true, 'forceDraw should be set to true for immediate UI update');
    });

    it('should set forceDraw when other player health is updated', () => {
        const healthUpdate = {
            id: 'other-player-456',
            health: 25,
            previousHealth: 40
        };

        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(healthUpdate);

        assert.equal(mockGame.otherPlayers['other-player-456'].health, 25, 'Other player health should be updated');
        assert.equal(mockGame.forceDraw, true, 'forceDraw should be set to true for immediate UI update');
    });

    it('should not set forceDraw when health update has invalid data', () => {
        const invalidUpdate = {
            id: null,
            health: 20
        };

        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(invalidUpdate);

        assert.equal(mockGame.forceDraw, false, 'forceDraw should not be set for invalid updates');
    });
});
