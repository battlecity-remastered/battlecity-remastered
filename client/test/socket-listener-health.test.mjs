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

    it('allows medkit heals to apply even when they raise health', () => {
        const damageUpdate = {
            id: 'test-player-123',
            health: 8,
            previousHealth: 12,
            source: { type: 'bullet' },
            healthSequence: 1
        };
        const medkitUpdate = {
            id: 'test-player-123',
            health: 40,
            previousHealth: 8,
            source: { type: 'medkit' },
            healthSequence: 2
        };

        mockGame.player.health = 12;
        mockGame.player.healthSequence = 0;
        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(damageUpdate);
        assert.equal(mockGame.player.health, 8, 'Damage update should reduce health');

        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(medkitUpdate);
        assert.equal(mockGame.player.health, 40, 'Medkit update should heal even if it increases health');
        assert.equal(mockGame.forceDraw, true, 'Medkit heal should still trigger UI redraw');
    });

    it('still ignores non-medkit health increases', () => {
        const staleHeal = {
            id: 'test-player-123',
            health: 30,
            previousHealth: 10,
            source: { type: 'hospital' },
            healthSequence: 1
        };

        mockGame.player.health = 10;
        mockGame.player.healthSequence = 2; // newer state already seen
        mockGame.forceDraw = false;
        mockSocketListener.applyHealthUpdate(staleHeal);

        assert.equal(mockGame.player.health, 10, 'Non-medkit heal should be ignored if it increases health');
        assert.equal(mockGame.forceDraw, false, 'forceDraw should remain unchanged for ignored updates');
    });

    it('ignores older-sequence damage but accepts newer damage', () => {
        mockGame.player.health = 25;
        mockGame.player.healthSequence = 5;

        const staleDamage = {
            id: 'test-player-123',
            health: 20,
            previousHealth: 25,
            source: { type: 'bullet' },
            healthSequence: 4
        };
        const freshDamage = {
            id: 'test-player-123',
            health: 15,
            previousHealth: 25,
            source: { type: 'bullet' },
            healthSequence: 6
        };

        mockSocketListener.applyHealthUpdate(staleDamage);
        assert.equal(mockGame.player.health, 25, 'Older sequence update should be ignored');

        mockSocketListener.applyHealthUpdate(freshDamage);
        assert.equal(mockGame.player.health, 15, 'Newer sequence update should be applied');
        assert.equal(mockGame.player.healthSequence, 6, 'Health sequence should be updated');
    });
});
