"use strict";

const assert = require("node:assert/strict");
const { describe, it } = require("node:test");

const BulletFactory = require("../src/BulletFactory");

const TILE_SIZE = 48;

const toPixels = (tiles) => tiles * TILE_SIZE;

const createBulletFactory = (buildings = []) => {
    const buildingEntries = buildings.map((building, index) => [String(index), building]);
    const game = {
        map: [[0]],
        players: {},
        buildingFactory: {
            buildings: new Map(buildingEntries),
        },
    };
    const playerFactory = {
        getPlayerTeam: () => null,
        applyDamage: () => { },
    };
    return new BulletFactory(game, playerFactory);
};

const baseTileX = 5;
const baseTileY = 7;
const basePixelX = toPixels(baseTileX);
const basePixelY = toPixels(baseTileY);

const walkwayBullet = { x: basePixelX + 10, y: basePixelY + TILE_SIZE + 12 };
const upperBullet = { x: basePixelX + 10, y: basePixelY + 12 };

describe("BulletFactory structure collisions", () => {
    it("allows shots through command center bays while blocking the upper deck", () => {
        const bulletFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 0 },
        ]);

        assert.equal(bulletFactory.checkStructureCollision({ ...walkwayBullet }), false);
        assert.equal(bulletFactory.checkStructureCollision({ ...upperBullet }), true);
    });

    it("blocks the full footprint for standard factories", () => {
        const bulletFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 101 },
        ]);

        assert.equal(bulletFactory.checkStructureCollision({ ...walkwayBullet }), true);
        assert.equal(bulletFactory.checkStructureCollision({ ...upperBullet }), true);
    });

    it("respects hospital bays in the same way as the client", () => {
        const hospitalFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 200 },
        ]);

        assert.equal(hospitalFactory.checkStructureCollision({ ...walkwayBullet }), false);
        assert.equal(hospitalFactory.checkStructureCollision({ ...upperBullet }), true);

        const hospitalFamilyFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 2 },
        ]);

        assert.equal(hospitalFamilyFactory.checkStructureCollision({ ...walkwayBullet }), false);
        assert.equal(hospitalFamilyFactory.checkStructureCollision({ ...upperBullet }), true);

        const hospitalStringFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: '200' },
        ]);

        assert.equal(hospitalStringFactory.checkStructureCollision({ ...walkwayBullet }), false);
        assert.equal(hospitalStringFactory.checkStructureCollision({ ...upperBullet }), true);
    });

    it("applies bay rules to structure-fired bullets such as turrets", () => {
        const bulletFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 0 },
        ]);

        assert.equal(
            bulletFactory.checkStructureCollision({ ...walkwayBullet, sourceType: "turret" }),
            false
        );
        assert.equal(
            bulletFactory.checkStructureCollision({ ...upperBullet, sourceType: "turret" }),
            true
        );
    });

    it("blocks the full 3x3 footprint for research buildings", () => {
        const bulletFactory = createBulletFactory([
            { x: baseTileX, y: baseTileY, type: 400 },
        ]);

        assert.equal(bulletFactory.checkStructureCollision({ ...walkwayBullet }), true);
        assert.equal(bulletFactory.checkStructureCollision({ ...upperBullet }), true);
    });
});

