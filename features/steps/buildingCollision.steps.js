"use strict";

const assert = require("assert");
const { Given, When, Then, Before, After } = require("../localCucumber.js");

const BUILDING_TYPES = {
    "command center": { type: 0, footprint: { width: 3, height: 3 } },
    "turret factory": { type: 109, footprint: { width: 3, height: 3 } },
    "hospital": { type: 200, footprint: { width: 3, height: 3 } },
    "research lab": { type: 401, footprint: { width: 3, height: 3 } },
};

const normaliseName = (name) => name.trim().toLowerCase();

const toOffset = (tile, tileSize) => ({
    x: tile.x * tileSize,
    y: tile.y * tileSize
});

const offsetsEqual = (a, b) => {
    return Number(a?.x) === Number(b?.x) && Number(a?.y) === Number(b?.y);
};

const resolveBuilding = (label) => {
    const key = normaliseName(label);
    if (BUILDING_TYPES[key]) {
        return BUILDING_TYPES[key];
    }
    throw new Error(`Unsupported building label: ${label}`);
};

const selectTargetTile = (context, { bottomRow = false } = {}) => {
    const width = context.footprint.width || 1;
    const height = context.footprint.height || 1;
    const centerX = context.tile.x + Math.floor(width / 2);
    if (bottomRow) {
        const bottomY = context.tile.y + Math.max(0, height - 1);
        return { x: centerX, y: bottomY };
    }
    // Default to the top row center to hit the blocking portion.
    return { x: centerX, y: context.tile.y };
};

const attemptMove = async (world, socketId, startOffset, targetOffset) => {
    const socket = world.getSocketById(socketId);
    assert(socket, "Socket not found for movement attempt");
    const state = await world.loadPlayerState(socketId);
    const player = state && state.player;
    assert(player, "Player state unavailable for movement attempt");
    const payload = {
        id: socketId,
        city: player.city,
        isMayor: player.isMayor,
        health: player.health,
        direction: player.direction || 0,
        isTurning: 0,
        isMoving: 1,
        sequence: (player.sequence || 0) + 1,
        offset: targetOffset
    };

    return await new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off("player:rejected", onRejected);
            socket.off("player", onPlayer);
            reject(new Error("Timed out waiting for movement response"));
        }, 1000);

        const cleanup = () => {
            clearTimeout(timer);
            socket.off("player:rejected", onRejected);
            socket.off("player", onPlayer);
        };

        const onRejected = (payload) => {
            const data = world.parsePayload(payload);
            const playerPayload = data && data.player ? data.player : player;
            cleanup();
            resolve({
                rejected: true,
                reasons: data?.reasons || [],
                flags: data?.flags || [],
                finalOffset: playerPayload?.offset || startOffset
            });
        };

        const onPlayer = (payload) => {
            const data = world.parsePayload(payload);
            if (!data || data.id !== socketId) {
                return;
            }
            cleanup();
            resolve({
                rejected: false,
                finalOffset: data.offset || targetOffset
            });
        };

        socket.on("player:rejected", onRejected);
        socket.on("player", onPlayer);
        socket.emit("player", JSON.stringify(payload));
    });
};

Before(async function () {
    this.movementContext = null;
});

After(async function () {
    await this.closeSockets();
    await this.stopServer();
});

Given(/^a connected player in city (\d+)$/, async function (cityId) {
    const join = await this.ensureTestPlayer(Number(cityId));
    this.movementContext = {
        socketId: join.socketId,
        cityId: join.assignment?.city ?? Number(cityId),
        tile: null,
        buildingType: null,
        footprint: null,
        tileSize: null,
        result: null
    };
});

Given(/^a (.+) is placed at tile (\d+),(\d+) for that city$/, async function (buildingLabel, tileX, tileY) {
    assert(this.movementContext, "Movement context not initialised");
    const descriptor = resolveBuilding(buildingLabel);
    const building = await this.createBuilding({
        type: descriptor.type,
        x: Number(tileX),
        y: Number(tileY),
        cityId: this.movementContext.cityId
    });
    assert(building, "Building creation failed");
    const constants = await this.loadServerConstants();
    this.movementContext.tile = { x: Number(tileX), y: Number(tileY) };
    this.movementContext.buildingType = descriptor.type;
    this.movementContext.footprint = descriptor.footprint;
    this.movementContext.tileSize = constants.tileSize || 48;
});

When(/^the player attempts to drive onto the bottom row of that building$/, async function () {
    assert(this.movementContext, "Movement context not initialised");
    const targetTile = selectTargetTile(this.movementContext, { bottomRow: true });
    const startTile = { x: targetTile.x, y: targetTile.y + 1 };
    const startOffset = toOffset(startTile, this.movementContext.tileSize);
    const targetOffset = toOffset(targetTile, this.movementContext.tileSize);
    await this.setPlayerPosition(this.movementContext.socketId, startOffset.x, startOffset.y);
    const result = await attemptMove(this, this.movementContext.socketId, startOffset, targetOffset);
    this.movementContext.result = { targetOffset, startOffset, response: result };
});

When(/^the player attempts to drive into the blocking footprint of that building$/, async function () {
    assert(this.movementContext, "Movement context not initialised");
    const targetTile = selectTargetTile(this.movementContext, { bottomRow: false });
    const startTile = { x: targetTile.x, y: targetTile.y + 1 };
    const startOffset = toOffset(startTile, this.movementContext.tileSize);
    const targetOffset = toOffset(targetTile, this.movementContext.tileSize);
    await this.setPlayerPosition(this.movementContext.socketId, startOffset.x, startOffset.y);
    const result = await attemptMove(this, this.movementContext.socketId, startOffset, targetOffset);
    this.movementContext.result = { targetOffset, startOffset, response: result };
});

Then(/^the movement update is accepted$/, function () {
    assert(this.movementContext?.result, "Missing movement result");
    const { targetOffset, response } = this.movementContext.result;
    assert(!response.rejected, `Expected movement to be accepted, got rejection: ${response.reasons || []}`);
    assert(
        offsetsEqual(response.finalOffset, targetOffset),
        `Expected final offset ${JSON.stringify(targetOffset)} but got ${JSON.stringify(response.finalOffset)}`
    );
});

Then(/^the movement update is rejected for collision$/, function () {
    assert(this.movementContext?.result, "Missing movement result");
    const { startOffset, targetOffset, response } = this.movementContext.result;
    const finalOffset = response.finalOffset || startOffset;
    assert(
        response.rejected || offsetsEqual(finalOffset, startOffset),
        `Expected movement to be blocked at ${JSON.stringify(targetOffset)}, ended at ${JSON.stringify(finalOffset)}`
    );
});
