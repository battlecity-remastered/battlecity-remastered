import test from 'node:test';
import assert from 'node:assert/strict';

import ItemFactory from '../src/factories/ItemFactory.js';
import IconFactory from '../src/factories/IconFactory.js';
import { ITEM_TYPE_BOMB } from '../src/constants.js';

const createGame = () => {
    const removeCalls = [];
    const game = {
        player: {
            id: 'player_socket',
            city: 2,
            offset: { x: 0, y: 0 },
            bombsArmed: true,
            collidedItem: null,
        },
        otherPlayers: {},
        rogueTankManager: null,
        buildingFactory: { getHead: () => null },
        map: [[0]],
        socketListener: {
            on: () => {},
            removeHazard: (...args) => removeCalls.push(args),
        },
        forceDraw: false,
    };
    return { game, removeCalls };
};

const setupFactories = () => {
    const { game, removeCalls } = createGame();
    const iconFactory = new IconFactory(game);
    game.iconFactory = iconFactory;
    const itemFactory = new ItemFactory(game);
    game.itemFactory = itemFactory;
    return { game, iconFactory, itemFactory, removeCalls };
};

test('pickupFriendlyBomb returns a bomb to the owner inventory and removes the hazard', () => {
    const { game, iconFactory, itemFactory, removeCalls } = setupFactories();
    const bomb = itemFactory.newItem({ id: game.player.id, city: game.player.city }, 0, 0, ITEM_TYPE_BOMB, {
        notifyServer: false,
    });
    game.player.collidedItem = bomb;

    const handled = itemFactory.pickupFriendlyBomb();

    assert.equal(handled, true);
    const icon = iconFactory.findOwnedIconByType(game.player.id, ITEM_TYPE_BOMB);
    assert.ok(icon, 'bomb icon should be created on pickup');
    assert.equal(icon.quantity, 1);
    assert.equal(icon.selected, true);
    assert.equal(icon.armed, false);
    assert.equal(game.player.bombsArmed, false);
    assert.equal(game.player.collidedItem, null);
    assert.equal(itemFactory.getHead(), null, 'bomb should be removed from the world');
    assert.equal(removeCalls.length, 1);
    assert.equal(removeCalls[0][0].reason, 'picked_up');
});

test('pickupFriendlyBomb refuses enemy bombs', () => {
    const { game, iconFactory, itemFactory, removeCalls } = setupFactories();
    const bomb = itemFactory.newItem({ id: 'enemy_socket', city: 9 }, 0, 0, ITEM_TYPE_BOMB, {
        notifyServer: false,
    });
    game.player.collidedItem = bomb;

    const handled = itemFactory.pickupFriendlyBomb();

    assert.equal(handled, false);
    assert.equal(iconFactory.findOwnedIconByType(game.player.id, ITEM_TYPE_BOMB), null);
    assert.equal(itemFactory.getHead(), bomb, 'bomb should remain when pickup is refused');
    assert.equal(removeCalls.length, 0);
});
