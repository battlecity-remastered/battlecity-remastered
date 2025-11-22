import assert from 'node:assert/strict';
import {describe, it} from 'node:test';

import BulletFactory from '../src/factories/BulletFactory.js';

const TILE_SIZE = 48;

const createItem = () => ({
    id: 'item_1',
    x: 0,
    y: 0,
    w: TILE_SIZE,
    h: TILE_SIZE,
    next: null,
    previous: null,
});

const createGame = ({itemFactory, map} = {}) => ({
    map: map ?? [[0]],
    otherPlayers: {},
    rogueTankManager: null,
    player: {id: 'local', offset: {x: TILE_SIZE * 4, y: TILE_SIZE * 4}, city: 1},
    buildingFactory: {getHead: () => null},
    itemFactory,
    timePassed: 0,
});

describe('turret bullets', () => {
    it('do not damage items when fired by defenses', () => {
        const item = createItem();
        let hitCount = 0;
        let explosions = 0;
        const itemFactory = {
            getHead: () => item,
            handleBulletHit: () => {
                hitCount += 1;
                return {consumed: true};
            },
            spawnExplosion: () => {
                explosions += 1;
            }
        };
        const game = createGame({itemFactory});
        const factory = new BulletFactory(game);

        factory.newBullet('defense_1', item.x, item.y, 0, 0, null, {
            sourceType: 'turret',
            sourceId: 'defense_1'
        });

        factory.cycle();

        assert.equal(hitCount, 0);
        assert.equal(explosions, 1);
        assert.equal(factory.getHead(), null);
    });

    it('still damage items when fired by players', () => {
        const item = createItem();
        let hitCount = 0;
        const itemFactory = {
            getHead: () => item,
            handleBulletHit: () => {
                hitCount += 1;
                return {consumed: true};
            }
        };
        const game = createGame({itemFactory});
        const factory = new BulletFactory(game);

        factory.newBullet('player_1', item.x, item.y, 0, 0);

        factory.cycle();

        assert.equal(hitCount, 1);
        assert.equal(factory.getHead(), null);
    });
});
