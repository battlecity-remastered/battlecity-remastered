import test from 'node:test';
import assert from 'node:assert/strict';

import ItemFactory from '../src/factories/ItemFactory.js';
import IconFactory from '../src/factories/IconFactory.js';
import { ITEM_TYPE_CLOAK, TIMER_CLOAK } from '../src/constants.js';

const setupGame = () => {
    const useCalls = [];
    const game = {
        player: {
            id: 'player_socket',
            city: 1,
            offset: { x: 10, y: 20 },
            isCloaked: false,
            cloakExpiresAt: 0,
        },
        otherPlayers: {},
        rogueTankManager: null,
        buildingFactory: { getHead: () => null },
        map: [[0]],
        socketListener: {
            on: () => {},
            useItem: (...args) => useCalls.push(args),
        },
        forceDraw: false,
        audio: null,
    };
    const iconFactory = new IconFactory(game);
    game.iconFactory = iconFactory;
    const itemFactory = new ItemFactory(game);
    game.itemFactory = itemFactory;
    return { game, iconFactory, itemFactory, useCalls };
};

test('activateCloak consumes an icon and notifies the server', () => {
    const { game, iconFactory, itemFactory, useCalls } = setupGame();
    const icon = iconFactory.newIcon(game.player.id, 0, 0, ITEM_TYPE_CLOAK);
    const iconId = icon.id;
    const before = Date.now();

    const activated = itemFactory.activateCloak();

    assert.equal(activated, true);
    assert.equal(iconFactory.findOwnedIconByType(game.player.id, ITEM_TYPE_CLOAK), null);
    assert.equal(game.player.isCloaked, true);
    assert.ok(game.player.cloakExpiresAt >= before + TIMER_CLOAK - 20);
    assert.ok(useCalls.length === 1, 'useItem should be emitted once');
    const [event, payload] = useCalls[0];
    assert.equal(event, 'cloak');
    assert.equal(payload.iconId, iconId);
    assert.equal(payload.type, ITEM_TYPE_CLOAK);
    assert.equal(payload.duration, TIMER_CLOAK);
});
