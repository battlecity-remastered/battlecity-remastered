import { test } from 'node:test';
import assert from 'node:assert';
import { NavMask } from '../src/bots/navmask.js';

const TILE_SIZE = 48;

function buildGame({ width = 12, height = 12, blockers = [], defenses = [] } = {}) {
    const map = [];
    for (let x = 0; x < width; x += 1) {
        map[x] = [];
        for (let y = 0; y < height; y += 1) {
            map[x][y] = 0; // grass
        }
    }
    blockers.forEach(([x, y]) => {
        if (x >= 0 && x < width && y >= 0 && y < height) {
            map[x][y] = 1; // rock
        }
    });

    const defensesList = defenses.map((entry) => ({
        x: entry.x * TILE_SIZE,
        y: entry.y * TILE_SIZE,
        type: entry.type ?? 9, // default turret
        isDefense: entry.isDefense ?? true,
        next: null
    }));
    defensesList.forEach((node, idx) => {
        node.next = defensesList[idx + 1] || null;
    });

    return {
        map,
        itemFactory: {
            getHead: () => defensesList[0] || null
        },
        buildingFactory: {
            getHead: () => null
        }
    };
}

test('NavMask marks rocks as blocked and grass as passable', () => {
    const game = buildGame({ blockers: [[2, 2]] });
    const nav = new NavMask(game);
    const mask = nav.getMask(1000);
    assert.ok(mask.isPassableTile(0, 0));
    assert.ok(mask.isBlockedTile(2, 2));
});

test('NavMask blocks defensive items', () => {
    const game = buildGame({ defenses: [{ x: 3, y: 4, type: 9 }] });
    const nav = new NavMask(game);
    const mask = nav.getMask(1000);
    assert.ok(mask.isBlockedTile(3, 4), 'defense tile should be blocked');
    assert.ok(mask.isBlockedTile(2, 4), 'neighbor tiles are padded as blocked to keep bots away from hazards');
});
