import assert from 'node:assert';
import test from 'node:test';
import SocketListener from '../src/SocketListener.js';

const createListener = (playerId = 'player-1') => {
    let bulletCalls = 0;
    let lastArgs = null;
    const game = {
        player: { id: playerId },
        bulletFactory: {
            newBullet: (...args) => {
                bulletCalls += 1;
                lastArgs = args;
            }
        },
        explosions: []
    };
    const listener = new SocketListener(game);
    return {
        listener,
        getBulletCallCount: () => bulletCalls,
        getLastArgs: () => lastArgs
    };
};

test('ignores local player bullets emitted by the server', () => {
    const { listener, getBulletCallCount } = createListener();
    listener.handleBulletShot({
        shooter: 'player-1',
        sourceType: 'player',
        x: 10,
        y: 10,
        type: 0,
        angle: 0
    });
    assert.strictEqual(getBulletCallCount(), 0);
});

test('spawns bullets for remote players', () => {
    const { listener, getBulletCallCount, getLastArgs } = createListener();
    listener.handleBulletShot({
        shooter: 'player-2',
        sourceType: 'player',
        x: 5,
        y: 6,
        type: 1,
        angle: 4,
        team: 7
    });
    assert.strictEqual(getBulletCallCount(), 1);
    assert.ok(Array.isArray(getLastArgs()));
    assert.strictEqual(getLastArgs()[0], 'player-2');
});

test('allows local structure-origin bullets (e.g., turret)', () => {
    const { listener, getBulletCallCount } = createListener();
    listener.handleBulletShot({
        shooter: 'player-1',
        sourceType: 'turret',
        sourceId: 'turret-99',
        x: 15,
        y: 25,
        type: 0,
        angle: 8
    });
    assert.strictEqual(getBulletCallCount(), 1);
});
