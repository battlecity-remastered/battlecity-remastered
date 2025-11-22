import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildRoleLabel } from '../src/draw/nameLabels.js';

const gameWithCallsigns = {
    resolveCallsign: (id) => (id === 'p1' ? 'Ace' : null)
};

test('mayor labels prefer explicit ScoreService rank titles from metadata', () => {
    const label = buildRoleLabel(gameWithCallsigns, {
        id: 'p1',
        isMayor: true,
        city: 0,
        rankTitle: 'Baron',
        rank: 'General'
    });
    assert.equal(label, 'Baron Ace\nBalkh');
});

test('ignores unknown titles and falls back to known rank strings', () => {
    const label = buildRoleLabel(gameWithCallsigns, {
        id: 'p1',
        city: 1,
        rankTitle: 'Supreme General',
        rank: 'Captain '
    });
    assert.equal(label, 'Captain Ace\nIqaluit');
});

test('derives rank title from points when rank strings are absent or invalid', () => {
    const label = buildRoleLabel(gameWithCallsigns, { id: 'p1', city: 1, rank: 'Space Wizard', points: 1200 });
    assert.equal(label, 'Lieutenant Ace\nIqaluit');
});

test('rogue label omits city line and defaults callsign', () => {
    const label = buildRoleLabel({}, { id: 'other', city: -1 });
    assert.equal(label, 'Rogue Unit');
});
