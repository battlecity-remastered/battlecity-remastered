import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import { LABELS } from '../src/constants.js';

const require = createRequire(import.meta.url);
const { BUILD_TREE_CONFIG } = require('../../shared/buildTreeConfig.js');

test('build icons match shared build tree config (menu and building icons)', () => {
    BUILD_TREE_CONFIG.forEach((entry) => {
        const label = LABELS[entry.key];
        assert.ok(label, `LABELS should contain ${entry.key}`);
        const expectedMenu = entry.menuIcon ?? entry.icon;
        const expectedBuilding = entry.buildingIcon ?? entry.icon;
        assert.equal(label.MENU_ICON ?? label.ICON, expectedMenu, `${entry.key} menu icon should stay ${expectedMenu}`);
        assert.equal(label.BUILDING_ICON ?? label.ICON, expectedBuilding, `${entry.key} building icon should stay ${expectedBuilding}`);
    });
});
