import test from "node:test";
import assert from "node:assert/strict";
import { createClientState } from "../src/app/state.js";
import { buildTickPlan } from "../src/app/intents.js";

const collectTypes = (state = createClientState()): string[] => {
    state.local.id = "local";
    state.local.city = 2;
    return buildTickPlan(state, Date.now() + 10_000, 100).intents.map((intent) => intent.type);
};

test("shoot control emits bullet.fire.request intent", () => {
    const state = createClientState();
    state.controls.shoot = true;
    state.inventory.set(12, 1);
    const types = collectTypes(state);
    assert.ok(types.includes("bullet.fire.request"));
});

test("ctrl flare burst emits three rear spread flare shots", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.direction = 0;
    state.local.x = 128;
    state.local.y = 128;
    state.local.pendingFlareBurst = true;
    state.inventory.set(6, 1);

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const shots = plan.intents.filter((intent) => intent.type === "bullet.fire.request");
    assert.equal(shots.length, 3);
    assert.deepEqual(shots.map((shot) => shot.payload.type), [3, 3, 3]);
    assert.deepEqual(shots.map((shot) => shot.payload.direction), [12, 8, 4]);
    assert.ok(Math.abs(shots[0]!.payload.position.x - 152) < 0.001);
    assert.ok(Math.abs(shots[0]!.payload.position.y - 165.45) < 0.001);
});

test("bullet.fire.request uses muzzle position and bullet heading mapped from tank direction", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.local.direction = 0;
    state.controls.shoot = true;
    state.inventory.set(12, 1);

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const shot = plan.intents.find((intent) => intent.type === "bullet.fire.request");
    assert.ok(shot);
    assert.equal(shot.payload.ownerId, "local");
    assert.equal(shot.payload.direction, 24);
    assert.equal(shot.payload.type, 0);
    assert.ok(Math.abs(shot.payload.position.x - 152) < 0.001);
    assert.ok(Math.abs(shot.payload.position.y - 128.55) < 0.001);
});

test("bullet.fire.request keeps left-facing shots horizontal", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.local.direction = 24;
    state.controls.shoot = true;
    state.inventory.set(12, 1);

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const shot = plan.intents.find((intent) => intent.type === "bullet.fire.request");
    assert.ok(shot);
    assert.equal(shot.payload.direction, 16);
    assert.ok(Math.abs(shot.payload.position.y - 152) < 0.001);
    assert.ok(Math.abs(shot.payload.position.x - 134.55) < 0.001);
});

test("shoot control does not emit bullet.fire.request without laser or rocket inventory", () => {
    const state = createClientState();
    state.controls.shoot = true;
    const types = collectTypes(state);
    assert.equal(types.includes("bullet.fire.request"), false);
});

test("collect/use controls emit item lifecycle intents", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.controls.collectFactory = true;
    state.controls.useItem = true;
    state.ui.selectedInventoryItemType = 4;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const types = plan.intents.map((intent) => intent.type);
    assert.ok(types.includes("icon.pickup.request"));
    assert.ok(types.includes("item.use.request"));

    const pickupIntent = plan.intents.find((intent) => intent.type === "icon.pickup.request");
    assert.ok(pickupIntent);
    assert.equal(pickupIntent.payload.itemType, 4);
});

test("cloak control emits item.use.request with cloak item type", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.controls.useCloak = true;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const use = plan.intents.find((intent) => intent.type === "item.use.request");
    assert.ok(use);
    assert.equal(use.payload.itemType, 0);
});

test("collectFactory defaults pickup requests to laser when no inventory item is selected", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.controls.collectFactory = true;
    state.ui.selectedInventoryItemType = null;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const pickupIntent = plan.intents.find((intent) => intent.type === "icon.pickup.request");
    assert.ok(pickupIntent);
    assert.equal(pickupIntent.payload.itemType, 12);
});

test("collectFactory picks nearby factory drop item type over selected inventory type", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = (4 * 48) + 56;
    state.local.y = (3 * 48) + 102;
    state.controls.collectFactory = true;
    state.ui.selectedInventoryItemType = 12;
    state.buildings.set("factory-medkit", {
        id: "factory-medkit",
        ownerId: "local",
        cityId: 2,
        type: 102,
        tileX: 4,
        tileY: 3,
        health: 100,
        maxHealth: 100,
        population: 50
    });
    state.factoryStock.set(2, new Map<number, number>([[2, 1], [12, 4]]));

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const pickupIntent = plan.intents.find((intent) => intent.type === "icon.pickup.request");
    assert.ok(pickupIntent);
    assert.equal(pickupIntent.payload.itemType, 2);
});

test("collectFactory prioritizes nearby friendly hazard pickup over factory stock", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 220;
    state.local.y = 220;
    state.controls.collectFactory = true;
    state.ui.selectedInventoryItemType = 12;
    state.hazards.set("h1", {
        id: "h1",
        cityId: 2,
        type: 3,
        x: 224,
        y: 224,
        radius: 48
    });
    state.factoryStock.set(2, new Map<number, number>([[12, 4]]));

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const pickupIntent = plan.intents.find((intent) => intent.type === "icon.pickup.request");
    assert.ok(pickupIntent);
    assert.equal(pickupIntent.payload.itemType, 3);
});

test("shift+use emits hazard.deploy.request for selected hazard inventory item", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.controls.useItem = true;
    state.controls.shift = true;
    state.ui.selectedInventoryItemType = 3;
    state.ui.bombArmed = true;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const dropIntent = plan.intents.find((intent) => intent.type === "hazard.deploy.request");
    assert.ok(dropIntent);
    assert.deepEqual(dropIntent.payload, {
        cityId: 2,
        type: 3,
        position: { x: 128, y: 128 },
        armed: true
    });
});

test("ctrl+b emits building.place.request using pointer tile instead of orb drop", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.controls.build = true;
    state.controls.ctrl = true;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 212;
    state.pointer.y = 192;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const buildingIntent = plan.intents.find((intent) => intent.type === "building.place.request");
    assert.ok(buildingIntent);
    assert.equal(plan.intents.some((intent) => intent.type === "orb.drop.request"), false);
    assert.deepEqual(buildingIntent.payload, {
        ownerId: "local",
        cityId: 2,
        type: 300,
        tileX: 1,
        tileY: 0
    });
});

test("ctrl+b uses selected build menu type for building.place.request", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.controls.build = true;
    state.controls.ctrl = true;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 212;
    state.pointer.y = 192;
    state.ui.selectedBuildType = 300;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const buildingIntent = plan.intents.find((intent) => intent.type === "building.place.request");
    assert.ok(buildingIntent);
    assert.equal(buildingIntent.payload.type, 300);
});

test("ctrl+b emits building.place.request even when placement is terrain-blocked", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.local.x = 128;
    state.local.y = 128;
    state.controls.build = true;
    state.controls.ctrl = true;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 212;
    state.pointer.y = 192;
    state.world.blockingTiles.add("1,0");

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const buildingIntent = plan.intents.find((intent) => intent.type === "building.place.request");
    assert.ok(buildingIntent);
    assert.equal(buildingIntent.payload.tileX, 1);
    assert.equal(buildingIntent.payload.tileY, 0);
});

test("queued build placement emits building.place.request without ctrl+b state", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.ui.pendingBuildPlacement = {
        tileX: 7,
        tileY: 8,
        type: 401
    };

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const buildingIntent = plan.intents.find((intent) => intent.type === "building.place.request");
    assert.ok(buildingIntent);
    assert.deepEqual(buildingIntent.payload, {
        ownerId: "local",
        cityId: 2,
        type: 401,
        tileX: 7,
        tileY: 8
    });
    assert.equal(state.ui.pendingBuildPlacement, null);
});

test("ctrl+demolish emits building.demolish.request for pointer tile building", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 1;
    state.local.x = 128;
    state.local.y = 128;
    state.controls.ctrl = true;
    state.controls.demolish = true;
    state.pointer.inside = true;
    state.pointer.surfaceWidth = 640;
    state.pointer.surfaceHeight = 480;
    state.pointer.x = 210;
    state.pointer.y = 260;
    state.buildings.set("b1", {
        id: "b1",
        ownerId: "other",
        cityId: 1,
        type: 109,
        tileX: 2,
        tileY: 3,
        health: 100,
        maxHealth: 100,
        population: 0
    });

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    const demolishIntent = plan.intents.find((intent) => intent.type === "building.demolish.request");
    assert.ok(demolishIntent);
    assert.equal(plan.intents.some((intent) => intent.type === "hazard.deploy.request"), false);
    assert.deepEqual(demolishIntent.payload, {
        id: "b1",
        cityId: 1
    });
});

test("buildTickPlan emits reverse throttle on player.update", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.city = 2;
    state.controls.moveBackward = true;

    const plan = buildTickPlan(state, Date.now() + 10_000, 100);
    assert.equal(plan.isMoving, true);
    assert.equal(plan.throttle, -1);

    const updateIntent = plan.intents.find((intent) => intent.type === "player.update");
    assert.ok(updateIntent);
    assert.equal(updateIntent.payload.isMoving, true);
    assert.equal(updateIntent.payload.throttle, -1);
});

test("buildTickPlan applies opposite turn direction for right and left controls", () => {
    const right = createClientState();
    right.local.id = "local";
    right.local.direction = 0;
    right.controls.turnRight = true;
    const rightPlan = buildTickPlan(right, Date.now() + 10_000, 1000);
    assert.equal(rightPlan.direction, 12);

    const left = createClientState();
    left.local.id = "local";
    left.local.direction = 0;
    left.controls.turnLeft = true;
    const leftPlan = buildTickPlan(left, Date.now() + 10_000, 1000);
    assert.equal(leftPlan.direction, 20);
});

test("buildTickPlan supports clockwise turn progression at 33ms tick cadence", () => {
    const state = createClientState();
    state.local.id = "local";
    state.local.direction = 0;
    state.controls.turnRight = true;

    const plan = buildTickPlan(state, Date.now() + 10_000, 33);
    assert.ok(plan.direction > 0);
    assert.ok(plan.direction < 1);
});
