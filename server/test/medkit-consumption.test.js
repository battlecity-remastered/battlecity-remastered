"use strict";

const test = require('node:test');
const assert = require('node:assert/strict');

const PlayerFactory = require('../src/PlayerFactory');
const { MAX_HEALTH } = require('../src/gameplay/constants');
const { ITEM_TYPES } = require('../src/items');

const createFactory = () => {
    const game = { players: {} };
    const factory = new PlayerFactory(game, {});
    factory.io = {
        emitted: [],
        emit(event, payload) {
            this.emitted.push({ event, payload });
        }
    };
    return { game, factory };
};

const buildSocket = (id) => ({ id });

test('medkit heals when inventory consumption succeeds', () => {
    const { game, factory } = createFactory();
    const socketId = 'p1';
    game.players[socketId] = { id: socketId, city: 0, health: 5 };
    factory.adjustCityInventory = () => 1; // simulate inventory present

    factory.handleItemUse(buildSocket(socketId), JSON.stringify({ type: 'medkit', iconId: 'icon1' }));

    assert.equal(game.players[socketId].health, MAX_HEALTH, 'Player should be healed to max');
    const healthEvent = factory.io.emitted.find((evt) => evt.event === 'player:health');
    assert.ok(healthEvent, 'Health update should be emitted');
});

test('medkit heals even if server inventory is missing (desync recovery)', () => {
    const { game, factory } = createFactory();
    const socketId = 'p2';
    game.players[socketId] = { id: socketId, city: 0, health: 7 };
    factory.adjustCityInventory = () => 0; // simulate missing inventory
    factory.game.buildingFactory = {
        cityManager: {
            recordInventoryPickup() {
                return 1;
            }
        }
    };

    factory.handleItemUse(buildSocket(socketId), JSON.stringify({ type: 'medkit', iconId: 'ghost' }));

    assert.equal(game.players[socketId].health, MAX_HEALTH, 'Player should still be healed even if inventory is out of sync');
    const healthEvent = factory.io.emitted.find((evt) => evt.event === 'player:health');
    assert.ok(healthEvent, 'Health update should be emitted even when inventory was missing');
});
