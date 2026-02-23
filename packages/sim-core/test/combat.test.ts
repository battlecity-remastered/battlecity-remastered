import test from "node:test";
import assert from "node:assert/strict";
import { stepBulletAndResolve, type BulletState } from "../src/index.js";

const mkBullet = (overrides: Partial<BulletState> = {}): BulletState => {
    return {
        id: "b1",
        ownerId: "p1",
        city: 1,
        x: 100,
        y: 100,
        direction: 0,
        speed: 900,
        type: 0,
        ...overrides
    };
};

test("bullet hits enemy player and computes next health", () => {
    const result = stepBulletAndResolve(
        mkBullet(),
        100,
        2000,
        2000,
        [
            { id: "p2", city: 2, x: 190, y: 100, health: 100, maxHealth: 100 }
        ],
        []
    );

    assert.equal(result.kind, "hit_player");
    if (result.kind === "hit_player") {
        assert.equal(result.playerId, "p2");
        assert.equal(result.nextHealth, 80);
        assert.equal(result.isDead, false);
    }
});

test("bullet ignores friendly players and continues", () => {
    const result = stepBulletAndResolve(
        mkBullet(),
        100,
        2000,
        2000,
        [
            { id: "p3", city: 1, x: 190, y: 100, health: 100, maxHealth: 100 }
        ],
        []
    );

    assert.equal(result.kind, "none");
});

test("bullet resolves out_of_bounds", () => {
    const result = stepBulletAndResolve(
        mkBullet({ x: 1999, y: 1999, direction: 4 }),
        100,
        2000,
        2000,
        [],
        []
    );

    assert.equal(result.kind, "out_of_bounds");
});

test("bullet can resolve against hazards", () => {
    const result = stepBulletAndResolve(
        mkBullet(),
        100,
        2000,
        2000,
        [],
        [],
        [
            { id: "h1", x: 190, y: 100, radius: 96 }
        ]
    );

    assert.equal(result.kind, "hit_hazard");
    if (result.kind === "hit_hazard") {
        assert.equal(result.hazardId, "h1");
    }
});

test("bullet resolves against blocking terrain tiles", () => {
    const result = stepBulletAndResolve(
        mkBullet(),
        100,
        2000,
        2000,
        [],
        [],
        [],
        (tileX, tileY) => tileX === 3 && tileY === 2
    );

    assert.equal(result.kind, "hit_terrain");
});
