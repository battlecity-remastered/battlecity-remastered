import assert from 'node:assert/strict';
import test from 'node:test';

import SocketListener from '../src/SocketListener.js';

const createListener = () => {
    const game = {
        player: { health: 100, offset: { x: 0, y: 0 } },
        otherPlayers: {}
    };
    const listener = new SocketListener(game);
    return { game, listener };
};

test('normalisePlayerPayload preserves valid rank metadata', () => {
    const { listener } = createListener();

    const payload = listener.normalisePlayerPayload({
        id: 'p1',
        points: '1200.8',
        rankTitle: '  Captain  '
    });

    assert.equal(payload.points, 1200);
    assert.equal(payload.rankTitle, 'Captain');
});

test('normalisePlayerPayload strips invalid rank metadata', () => {
    const { listener } = createListener();

    const payload = listener.normalisePlayerPayload({
        id: 'p2',
        points: -5,
        rankTitle: '   '
    });

    assert.ok(!('points' in payload));
    assert.ok(!('rankTitle' in payload));
});

test('applyPlayerUpdate persists rank metadata for other players', () => {
    const { listener, game } = createListener();

    listener.applyPlayerUpdate({
        id: 'remote-1',
        sequence: 1,
        points: 450,
        rankTitle: 'Sergeant'
    });

    assert.deepEqual(game.otherPlayers['remote-1'], {
        id: 'remote-1',
        sequence: 1,
        points: 450,
        rankTitle: 'Sergeant'
    });
});
