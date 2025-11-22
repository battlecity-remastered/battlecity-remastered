import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoleLabel } from '../src/draw/nameLabels.js';

const gameWithCallsigns = {
    resolveCallsign: (id) => (id === 'p1' ? 'Ace' : null)
};

test('mayor label shows rank title and city on separate lines', () => {
    const label = buildRoleLabel(gameWithCallsigns, { id: 'p1', isMayor: true, city: 0, rankTitle: 'General' });
    assert.equal(label, 'General Ace\nBalkh');
});

test('recruit label shows derived rank and city on separate lines', () => {
    const label = buildRoleLabel(gameWithCallsigns, { id: 'p1', city: 1, points: 1200 });
    assert.equal(label, 'Lieutenant Ace\nIqaluit');
});

test('rogue label omits city line', () => {
    const label = buildRoleLabel(gameWithCallsigns, { id: 'p1', city: -1 });
    assert.equal(label, 'Rogue Ace');
});
