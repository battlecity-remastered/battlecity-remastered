import { rectangleCollision } from "./collision-helpers.js";
import { getPlayerRect } from "./collision-helpers.js";


import { MAP_SQUARE_ROCK } from "../constants.js";
import { MAP_SQUARE_BUILDING } from "../constants.js";
import { BUILDING_COMMAND_CENTER } from "../constants.js";
import { BUILDING_REPAIR } from "../constants.js";
import { BUILDING_FACTORY } from "../constants";
import { isHospitalBuilding } from "../utils/buildings";

const TILE_SIZE = 48;
const BULLET_SIZE = 4;
const BLOCKING_TILE_VALUES = new Set([
    MAP_SQUARE_ROCK,
    MAP_SQUARE_BUILDING
]);


var collided = (testRect, bullet) => {

    var bulletRect = {
        x: bullet.x,
        y: bullet.y,
        w: 4,
        h: 4
    };

    return rectangleCollision(testRect, bulletRect);
};

const createBulletRect = (bullet) => ({
    x: bullet.x,
    y: bullet.y,
    w: BULLET_SIZE,
    h: BULLET_SIZE
});

const clampBulletRect = (game, rect) => {
    const mapWidth = Array.isArray(game.map) ? game.map.length : 0;
    const mapHeight = mapWidth > 0 && Array.isArray(game.map[0])
        ? game.map[0].length
        : 0;

    if (!mapWidth || !mapHeight) {
        return rect;
    }

    const maxX = Math.max(0, (mapWidth * TILE_SIZE) - rect.w);
    const maxY = Math.max(0, (mapHeight * TILE_SIZE) - rect.h);

    return {
        x: Math.max(0, Math.min(rect.x, maxX)),
        y: Math.max(0, Math.min(rect.y, maxY)),
        w: rect.w,
        h: rect.h
    };
};

const hitsBlockingTile = (game, rect) => {
    const map = Array.isArray(game.map) ? game.map : null;
    if (!map || !Array.isArray(map[0])) {
        return false;
    }

    const maxTileX = map.length - 1;
    const maxTileY = Array.isArray(map[0]) ? map[0].length - 1 : -1;
    if (maxTileX < 0 || maxTileY < 0) {
        return false;
    }

    const startTileX = Math.max(0, Math.floor(rect.x / TILE_SIZE));
    const endTileX = Math.min(maxTileX, Math.floor((rect.x + rect.w - 1) / TILE_SIZE));
    const startTileY = Math.max(0, Math.floor(rect.y / TILE_SIZE));
    const endTileY = Math.min(maxTileY, Math.floor((rect.y + rect.h - 1) / TILE_SIZE));

    for (let tileX = startTileX; tileX <= endTileX; tileX += 1) {
        const column = map[tileX];
        if (!Array.isArray(column)) {
            continue;
        }
        for (let tileY = startTileY; tileY <= endTileY; tileY += 1) {
            const value = column[tileY];
            if (BLOCKING_TILE_VALUES.has(value)) {
                return true;
            }
        }
    }

    return false;
};

export const collidedWithRock = (game, bullet) => {
    const rect = clampBulletRect(game, createBulletRect(bullet));
    return hitsBlockingTile(game, rect);
};


export const collidedWithAnotherPlayer = (game, bullet) => {

    return Object.keys(game.otherPlayers).some((id) => {
        const player = game.otherPlayers[id];
        if (!player || !player.offset) {
            return false;
        }

        if (bullet.shooter && bullet.shooter === id) {
            return false;
        }

        const bulletTeam = bullet.team ?? null;
        const playerTeam = player.city ?? null;
        if (bulletTeam !== null && playerTeam === bulletTeam) {
            return false;
        }

        return collided(getPlayerRect(player), bullet)
    }) || collidedWithRogues(game, bullet);
};

function collidedWithRogues(game, bullet) {
    const manager = game.rogueTankManager;
    if (!manager || !Array.isArray(manager.tanks)) {
        return false;
    }

    const bulletTeam = bullet.team ?? null;

    for (let i = 0; i < manager.tanks.length; i += 1) {
        const tank = manager.tanks[i];
        if (!tank || !tank.offset) {
            continue;
        }

        if (bullet.shooter && bullet.shooter === tank.id) {
            continue;
        }

        const tankTeam = tank.city ?? null;
        if (bulletTeam !== null && tankTeam === bulletTeam) {
            continue;
        }

        if (collided(getPlayerRect(tank), bullet)) {
            manager.handleBulletCollision(bullet, tank);
            return true;
        }
    }

    return false;
}

export const collidedWithCurrentPlayer = (game, bullet) => {

    const bulletTeam = bullet.team ?? null;
    const playerTeam = game.player?.city ?? null;

    if (bulletTeam !== null && bulletTeam === playerTeam) {
        return false;
    }

    if (bullet.shooter && bullet.shooter === game.player.id) {
        return false;
    }

    return collided(getPlayerRect(game.player), bullet);
};

export const collidedWithItem = (game, bullet) => {
    var item = game.itemFactory.getHead();

    while (item) {

        var itemRect = {
            x: item.x,
            y: item.y,
            w: 48,
            h: 48,
        };

        if (bullet.sourceId && item.id && bullet.sourceId === item.id) {
            item = item.next;
            continue;
        }

        if (collided(itemRect, bullet)) {
            return item;
        }

        item = item.next;
    }
    return null;
};

export const collidedWithBuilding = (game, bullet) => {
    var building = game.buildingFactory.getHead();

    while (building) {

        var buildingRect = {
            x: (building.x) * 48,
            y: (building.y) * 48,
            w: 144,
            h: 144,
        };

        const numericType = Number.isFinite(building.type)
            ? building.type
            : parseInt(building.type, 10);
        const baseType = Number.isFinite(numericType)
            ? Math.floor(numericType / 100)
            : NaN;
        const isCommandCenter = numericType === BUILDING_COMMAND_CENTER;
        const isFactory = baseType === BUILDING_FACTORY;
        const isHospital = isHospitalBuilding(building);
        const hasDriveableBay = isCommandCenter
            || isFactory
            || isHospital
            || baseType === BUILDING_REPAIR;

        if (hasDriveableBay) {
            buildingRect.h = buildingRect.h - 48;
        }
        if (collided(buildingRect, bullet)) {
            return true;
        }

        building = building.next;
    }
    return false;
};
