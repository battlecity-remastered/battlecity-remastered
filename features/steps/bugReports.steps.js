"use strict";

const assert = require("assert");
const { setTimeout: delay } = require("timers/promises");
const { Given, When, Then, Before, After, Pending } = require("../localCucumber.js");

const pendingReason = "Bug-report scenario not yet automated; implement gameplay harness before enabling assertions.";

Before(async function () {
    await this.startServer();
});

After(async function () {
    await this.closeSockets();
    await this.stopServer();
});

[
    "an AI city has been destroyed by an orb",
    "the AI city begins to rebuild",
    "structures respawn on their production timers instead of instantly blocking the player in"
].forEach((text) => {
    Given(text, function () {
        Pending(pendingReason);
    });
});

Given(/^a defended city with wall sections protecting a factory$/, async function () {
    const constants = await this.loadServerConstants();
    const tileSize = constants.tileSize || 48;
    const player = await this.ensureTestPlayer(0);
    const wall = await this.createDefense({
        cityId: player.assignment.city,
        type: 8, // wall
        x: 0,
        y: 0,
        life: 40,
        maxLife: 40
    });
    assert(wall && wall.id, "Failed to create wall defense");
    this.turretContext = {
        tileSize,
        wallId: wall.id,
        initialLife: wall.life ?? 40,
        cityId: player.assignment.city,
        socketId: player.socketId
    };
});

Given(/^an allied or neutral turret is actively firing at enemies$/, async function () {
    assert(this.turretContext, "Wall context missing");
    // Optional: register a turret defense for clarity
    const turret = await this.createDefense({
        cityId: this.turretContext.cityId,
        type: 9, // turret
        x: this.turretContext.tileSize,
        y: 0,
        life: 32,
        maxLife: 32
    });
    assert(turret && turret.id, "Failed to register turret");
    this.turretContext.turretId = turret.id;
});

When(/^a turret round collides with a wall tile$/, async function () {
    assert(this.turretContext, "Turret context missing");
    const { tileSize, wallId, cityId, socketId } = this.turretContext;
    const wall = await this.getDefense(wallId);
    assert(wall, "Wall not found");
    const impactX = wall.x + (tileSize / 2);
    const impactY = wall.y + (tileSize / 2);
    await this.fireDefenseRound({
        socketId,
        sourceType: "turret",
        sourceId: this.turretContext.turretId || "test_turret",
        x: impactX,
        y: impactY,
        angle: 0,
        type: 0,
        teamId: cityId
    });
    await delay(200);
});

Then(/^the wall tile remains intact and is not damaged by turret fire$/, async function () {
    assert(this.turretContext, "Turret context missing");
    const wall = await this.getDefense(this.turretContext.wallId);
    assert(wall, "Wall record missing after impact");
    const currentLife = wall.life ?? this.turretContext.initialLife;
    assert.strictEqual(currentLife, this.turretContext.initialLife, "Wall life changed after friendly turret fire");
});



// Note: "When the player consumes the medkit" step is defined in itemsMedkit.steps.js
// Note: "Then the player regains the expected health..." step is defined in itemsMedkit.steps.js

Given(/^a factory is actively producing an item$/, async function () {
    const player = await this.ensureTestPlayer(0);
    const factory = await this.createBuilding({
        type: 109, // Turret factory produces turrets (type % 100 === 9)
        x: 5,
        y: 5,
        cityId: player.assignment.city
    });
    assert(factory && factory.id, "Factory was not created");
    this.factoryContext = {
        factoryId: factory.id,
        socketId: player.socketId,
        cityId: player.assignment.city
    };
    await this.simulateFactoryProduction(factory.id, { itemType: 9, quantity: 1 });
});

Given(/^a player waits for the item to spawn on the pickup zone$/, async function () {
    assert(this.factoryContext, "Factory context missing");
    const state = await this.getBuilding(this.factoryContext.factoryId);
    assert(state, "Factory state missing");
    assert(state.itemsLeft >= 1, "Factory has not produced any items yet");
    this.factoryContext.initialItemsLeft = state.itemsLeft;
});

When(/^the player collects the item during production$/, async function () {
    assert(this.factoryContext, "Factory context missing");
    // Collect via icon pickup path (simulated)
    await this.collectFactoryItem(this.factoryContext.factoryId, {
        socketId: this.factoryContext.socketId,
        itemType: 9,
        quantity: 1
    });
    const state = await this.getBuilding(this.factoryContext.factoryId);
    this.factoryContext.afterPickup = state;
    const playerState = await this.loadPlayerState(this.factoryContext.socketId);
    this.factoryContext.inventoryAfterPickup = playerState?.inventory?.items?.turret || 0;
    // Also try to pick up via factory pickup handler to see if duplicates appear
    await this.collectFactoryItem(this.factoryContext.factoryId, {
        socketId: this.factoryContext.socketId,
        itemType: 9,
        quantity: 1
    });
    const finalState = await this.getBuilding(this.factoryContext.factoryId);
    this.factoryContext.finalState = finalState;
    const finalPlayer = await this.loadPlayerState(this.factoryContext.socketId);
    this.factoryContext.finalInventory = finalPlayer?.inventory?.items?.turret || 0;
});

Then(/^the inventory reflects a single item and additional duplicates are not created$/, function () {
    assert(this.factoryContext, "Factory context missing");
    assert.strictEqual(this.factoryContext.inventoryAfterPickup, 1, "Expected one item after icon pickup");
    assert(this.factoryContext.finalState, "Missing final factory state");
    assert.strictEqual(this.factoryContext.finalState.itemsLeft, 0, "Factory still reports items after pickup");
    assert.strictEqual(
        this.factoryContext.finalInventory,
        1,
        "Player inventory gained duplicates after factory pickup"
    );
});

Given(/^the player has a turret available to place$/, async function () {
    const player = await this.ensureTestPlayer(0);
    await this.grantPlayerItem(player.socketId, "turret", 1);
    const state = await this.loadPlayerState(player.socketId);
    const turrets = state?.inventory?.items?.turret || 0;
    assert(turrets > 0, "Expected player to have a turret available");
    this.turretPlacementContext = {
        socketId: player.socketId,
        cityId: player.assignment.city
    };
});

Given(/^a player with enough resources to place a turret$/, async function () {
    const player = await this.ensureTestPlayer(0);
    await this.grantPlayerItem(player.socketId, "turret", 1);
    const state = await this.loadPlayerState(player.socketId);
    const turrets = state?.inventory?.items?.turret || 0;
    assert(turrets > 0, "Expected player to have a turret available");
    this.turretPlacementContext = {
        socketId: player.socketId,
        cityId: player.assignment.city
    };
});

const resolveBuildingPlacement = (kind) => {
    const normalized = kind.trim().toLowerCase();
    if (normalized === "factory pickup zone" || normalized === "factory") {
        // Use bottom-left tile of the 3x3 footprint to verify entire bottom row is allowed
        return { type: 109, target: (building) => ({ x: building.x, y: building.y + 2 }) };
    }
    if (normalized === "command center" || normalized === "command center footprint") {
        return { type: 0, target: (building) => ({ x: building.x + 1, y: building.y + 1 }) };
    }
    if (normalized === "hospital" || normalized === "hospital footprint") {
        return { type: 200, target: (building) => ({ x: building.x + 1, y: building.y + 1 }) };
    }
    return null;
};

Given(/^the player is targeting (?:an |a |an open |the )?(factory pickup zone|command center footprint|hospital footprint)$/, async function (targetKind) {
    assert(this.turretPlacementContext, "Turret placement context missing");
    const placement = resolveBuildingPlacement(targetKind);
    assert(placement, `Unsupported placement target: ${targetKind}`);
    const building = await this.createBuilding({
        type: placement.type,
        x: 0,
        y: 0,
        cityId: this.turretPlacementContext.cityId
    });
    assert(building, "Failed to create building for placement");
    const constants = await this.loadServerConstants();
    const tileSize = constants.tileSize || 48;
    const pickupTile = placement.target(building);
    const desiredX = (pickupTile.x * tileSize) + (tileSize / 2);
    const desiredY = (pickupTile.y * tileSize) + (tileSize / 2);
    await this.setPlayerPosition(this.turretPlacementContext.socketId, desiredX, desiredY);
    this.turretPlacementContext.pickupTile = pickupTile;
});

When(/^the player places the turret on the pickup zone$/, async function () {
    assert(this.turretPlacementContext, "Turret placement context missing");
    const socket = this.getSocketById(this.turretPlacementContext.socketId);
    assert(socket, "Socket not found for turret placement");
    const placementAck = new Promise((resolve) => {
        const onUpdate = (payload) => {
            const data = this.parsePayload(payload);
            if (data && data.cityId === this.turretPlacementContext.cityId) {
                socket.off("city:defenses", onUpdate);
                resolve(data);
            }
        };
        socket.on("city:defenses", onUpdate);
        setTimeout(() => {
            socket.off("city:defenses", onUpdate);
            resolve(null);
        }, 500);
    });
    socket.emit("defense:spawn", JSON.stringify({
        type: 9, // turret
        cityId: this.turretPlacementContext.cityId,
        teamId: this.turretPlacementContext.cityId
    }));
    this.turretPlacementContext.spawnResult = await placementAck;
});

Then(/^the placement succeeds and the turret begins defending the factory$/, async function () {
    assert(this.turretPlacementContext, "Turret placement context missing");
    const defenses = this.turretPlacementContext.spawnResult?.items || [];
    const hasTurret = defenses.some((record) => Number(record.type) === 9);
    assert(hasTurret, "Turret did not appear in city defenses after placement");
});
