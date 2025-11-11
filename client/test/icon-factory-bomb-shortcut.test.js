import test from 'node:test';
import assert from 'node:assert/strict';

import IconFactory from '../src/factories/IconFactory.js';
import { ITEM_TYPE_BOMB } from '../src/constants.js';

const createGame = () => ({
    player: {
        id: 'player_socket',
        city: 7,
        bombsArmed: false,
        offset: { x: 0, y: 0 }
    },
    forceDraw: false,
    buildingFactory: null,
    socketListener: null,
});

const createFactory = () => {
    const game = createGame();
    const factory = new IconFactory(game);
    game.iconFactory = factory;
    return { game, factory };
};

test('dropBombFromInventory consumes a bomb and returns armed drop info', () => {
    const { game, factory } = createFactory();
    const icon = factory.newIcon(game.player.id, 12, 34, ITEM_TYPE_BOMB, {
        quantity: 3,
        selected: false,
        armed: false,
    });

    game.forceDraw = false;
    game.player.bombsArmed = false;

    const dropInfo = factory.dropBombFromInventory();

    assert.ok(dropInfo, 'Expected bomb drop info to be returned');
    assert.equal(dropInfo.type, ITEM_TYPE_BOMB);
    assert.equal(dropInfo.armed, true);
    assert.equal(icon.quantity, 2);
    assert.equal(icon.selected, false);
    assert.equal(icon.armed, false);
    assert.equal(game.player.bombsArmed, false);
    assert.equal(game.forceDraw, true);
});

test('dropBombFromInventory keeps stack armed when the player already armed bombs', () => {
    const { game, factory } = createFactory();
    const icon = factory.newIcon(game.player.id, 0, 0, ITEM_TYPE_BOMB, {
        quantity: 2,
        selected: true,
        armed: true,
    });

    game.forceDraw = false;
    game.player.bombsArmed = true;

    const dropInfo = factory.dropBombFromInventory();

    assert.ok(dropInfo);
    assert.equal(icon.quantity, 1);
    assert.equal(icon.selected, true);
    assert.equal(icon.armed, true);
    assert.equal(game.player.bombsArmed, true);
    assert.equal(game.forceDraw, true);
});

test('dropBombFromInventory clears selection and armed state when the last bomb is used', () => {
    const { game, factory } = createFactory();
    factory.newIcon(game.player.id, 0, 0, ITEM_TYPE_BOMB, {
        quantity: 1,
        selected: true,
        armed: true,
    });

    game.forceDraw = false;
    game.player.bombsArmed = true;

    const dropInfo = factory.dropBombFromInventory();

    assert.ok(dropInfo);
    assert.equal(factory.findOwnedIconByType(game.player.id, ITEM_TYPE_BOMB), null);
    assert.equal(game.player.bombsArmed, false);
    assert.equal(game.forceDraw, true);
});

test('dropBombFromInventory returns null when the player has no bombs', () => {
    const { game, factory } = createFactory();

    const dropInfo = factory.dropBombFromInventory();

    assert.equal(dropInfo, null);
    assert.equal(game.player.bombsArmed, false);
});
