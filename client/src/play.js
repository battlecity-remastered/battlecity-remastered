import {checkPlayerCollision} from "./collision/collision-player";

import {MOVEMENT_SPEED_PLAYER} from './constants';
import {MAX_HEALTH} from "./constants";
import {COLLISION_MAP_EDGE_LEFT} from "./constants";
import {COLLISION_MAP_EDGE_RIGHT} from "./constants";
import {COLLISION_MAP_EDGE_TOP} from "./constants";
import {COLLISION_MAP_EDGE_BOTTOM} from "./constants";
import {COLLISION_BLOCKING} from "./constants";
import {COLLISION_MINE} from "./constants";
import {COLLISION_DFG} from "./constants";
import {getCitySpawn} from "./utils/citySpawns";
import {getPlayerRect} from "./collision/collision-helpers";
import {rectangleCollision} from "./collision/collision-helpers";
import {isHospitalBuilding} from "./utils/buildings";
import {getHospitalDriveableRect} from "./utils/buildings";
import { SOUND_IDS } from "./audio/AudioManager";
import { profileCollision } from "./debug/collisionProfiler";

const TILE_SIZE = 48;
const NEAREST_SAFE_MAX_RADIUS_TILES = 12;
const HOSPITAL_HEAL_INTERVAL = 150;
const HOSPITAL_HEAL_AMOUNT = 2;

const BLOCKING_COLLISIONS = new Set([
    COLLISION_BLOCKING,
    COLLISION_MAP_EDGE_LEFT,
    COLLISION_MAP_EDGE_RIGHT,
    COLLISION_MAP_EDGE_TOP,
    COLLISION_MAP_EDGE_BOTTOM,
]);

const UNSTICK_DIRECTIONS = [
    {dx: 1, dy: 0},
    {dx: -1, dy: 0},
    {dx: 0, dy: 1},
    {dx: 0, dy: -1},
    {dx: 1, dy: 1},
    {dx: -1, dy: 1},
    {dx: 1, dy: -1},
    {dx: -1, dy: -1},
];

const UNSTICK_STEP = 6;
const UNSTICK_MAX_DISTANCE = 96;
const MAX_VELOCITY = 20;
const DIRECTION_STEPS = 32;

const DIRECTION_VECTORS = Array.from({ length: DIRECTION_STEPS }, (_unused, direction) => {
    const angle = (-direction / 16) * Math.PI;
    return {
        sin: Math.sin(angle),
        cos: Math.cos(angle),
    };
});

const normaliseDirection = (direction) => {
    if (!Number.isFinite(direction)) {
        return 0;
    }
    let normalised = Math.round(direction) % DIRECTION_STEPS;
    if (normalised < 0) {
        normalised += DIRECTION_STEPS;
    }
    return normalised;
};

const getDirectionVector = (direction) => DIRECTION_VECTORS[normaliseDirection(direction)];

const clampVelocity = (value) => {
    if (value > MAX_VELOCITY) {
        return MAX_VELOCITY;
    }
    if (value < -MAX_VELOCITY) {
        return -MAX_VELOCITY;
    }
    return value;
};

const runCollisionCheck = (game, context, { cacheResult = false } = {}) => {
    const collision = profileCollision(context, () => checkPlayerCollision(game));
    if (cacheResult && game?.player) {
        game.player.lastCollisionCode = collision;
        game.player.lastCollisionFrame = game._frameId || 0;
    }
    return collision;
};

const updateLastSafeOffset = (game) => {
    if (!game || !game.player) {
        return;
    }
    game.player.lastSafeOffset = {
        x: game.player.offset.x,
        y: game.player.offset.y
    };
};

const applyHospitalHealing = (game) => {
    if (!game || !game.player || !game.buildingFactory || typeof game.buildingFactory.findBuildingAtTile !== 'function') {
        return;
    }

    const playerRect = getPlayerRect(game.player);
    const centerX = playerRect.x + (playerRect.w / 2);
    const centerY = playerRect.y + (playerRect.h / 2);
    const tileX = Math.floor(centerX / TILE_SIZE);
    const tileY = Math.floor(centerY / TILE_SIZE);
    const building = game.buildingFactory.findBuildingAtTile(tileX, tileY);
    if (!isHospitalBuilding(building)) {
        return;
    }

    const healZone = getHospitalDriveableRect(building);
    if (!healZone || !rectangleCollision(playerRect, healZone)) {
        return;
    }

    if (!Number.isFinite(game.player.health) || game.player.health >= MAX_HEALTH) {
        return;
    }

    const now = game.tick || Date.now();
    const lastHeal = Number.isFinite(game.player.lastHospitalHealAt) ? game.player.lastHospitalHealAt : 0;
    if (now < lastHeal + HOSPITAL_HEAL_INTERVAL) {
        return;
    }

    const previousHealth = game.player.health;
    game.player.health = Math.min(MAX_HEALTH, previousHealth + HOSPITAL_HEAL_AMOUNT);
    game.player.lastHospitalHealAt = now;
    if (game.player.health !== previousHealth) {
        game.forceDraw = true;
    }
};

const isBlockingCollision = (collisionCode) => BLOCKING_COLLISIONS.has(collisionCode);

const handleMineCollision = (game, item) => {
    if (!item) {
        return;
    }

    game.itemFactory.triggerMine(item);

    game.forceDraw = true;
    game.player.collidedItem = null;
};

const handleDFGCollision = (game, item) => {
    if (!item) {
        return;
    }

    if (typeof game.itemFactory?.triggerDFG === 'function') {
        game.itemFactory.triggerDFG(item);
    }

    game.player.collidedItem = null;
};

var turnPlayer = (game) => {
    if (game.tick > game.player.timeTurn) {

        game.player.direction += game.player.isTurning;

        if (game.player.direction < 0) {
            game.player.direction = 31;
        }

        if (game.player.direction > 31) {
            game.player.direction = 0;
        }

        game.player.timeTurn = game.tick + 50;
    }
};


var movePlayer = (game) => {

    const previousX = game.player.offset.x;
    const previousY = game.player.offset.y;

    const directionVector = getDirectionVector(game.player.direction);
    const movementScale = game.player.isMoving * (game.timePassed * MOVEMENT_SPEED_PLAYER);

    const applyAxisMovement = (axis, velocityComponent, positiveEdge, negativeEdge) => {
        const preUpdate = game.player.offset[axis];
        game.player.offset[axis] += velocityComponent;
        switch (runCollisionCheck(game, `move:${axis}`)) {
            case positiveEdge:
                game.player.offset[axis] = 0;
                break;
            case negativeEdge:
                game.player.offset[axis] = (511) * 48;
                break;
            case COLLISION_BLOCKING:
                game.player.offset[axis] = preUpdate;
                break;
            case COLLISION_MINE:
                handleMineCollision(game, game.player.collidedItem);
                break;
            case COLLISION_DFG:
                handleDFGCollision(game, game.player.collidedItem);
                break;
            default:
                break;
        }
    };

    const velocityX = clampVelocity(directionVector.sin * movementScale);
    applyAxisMovement('x', velocityX, COLLISION_MAP_EDGE_LEFT, COLLISION_MAP_EDGE_RIGHT);

    const velocityY = clampVelocity(directionVector.cos * movementScale);
    applyAxisMovement('y', velocityY, COLLISION_MAP_EDGE_TOP, COLLISION_MAP_EDGE_BOTTOM);

    const debugMovement = !!(game && game.debug && game.debug.logMovement);
    if (
        (import.meta.env && import.meta.env.DEV) &&
        debugMovement &&
        (previousX !== game.player.offset.x || previousY !== game.player.offset.y)
    ) {
        console.log(`Player position: (${game.player.offset.x.toFixed(2)}, ${game.player.offset.y.toFixed(2)})`);
    }
};

const attemptUnstick = (game, originalPosition) => {
    for (let distance = UNSTICK_STEP; distance <= UNSTICK_MAX_DISTANCE; distance += UNSTICK_STEP) {
        for (const direction of UNSTICK_DIRECTIONS) {
            const candidateX = originalPosition.x + (direction.dx * distance);
            const candidateY = originalPosition.y + (direction.dy * distance);
            game.player.offset.x = candidateX;
            game.player.offset.y = candidateY;
            const collision = runCollisionCheck(game, 'unstick:probe');
            if (collision === COLLISION_MINE) {
                handleMineCollision(game, game.player.collidedItem);
                updateLastSafeOffset(game);
                return true;
            }
            if (!isBlockingCollision(collision)) {
                updateLastSafeOffset(game);
                return true;
            }
        }
    }
    return false;
};

const findNearestSafeOffset = (game, originOffset, maxRadiusTiles = NEAREST_SAFE_MAX_RADIUS_TILES) => {
    if (!game || !game.player || !Array.isArray(game.map)) {
        return null;
    }

    const mapWidth = game.map.length;
    const mapHeight = mapWidth > 0 && Array.isArray(game.map[0]) ? game.map[0].length : 0;
    if (mapWidth === 0 || mapHeight === 0) {
        return null;
    }

    const startTileX = Math.floor((originOffset.x + (TILE_SIZE / 2)) / TILE_SIZE);
    const startTileY = Math.floor((originOffset.y + (TILE_SIZE / 2)) / TILE_SIZE);

    const queue = [{ x: startTileX, y: startTileY, distance: 0 }];
    let head = 0;
    const visited = new Set();

    const originalOffset = { x: game.player.offset.x, y: game.player.offset.y };
    const originalCollidedItem = game.player.collidedItem;

    while (head < queue.length) {
        const node = queue[head++];
        const key = `${node.x},${node.y}`;
        if (visited.has(key)) {
            continue;
        }
        visited.add(key);

        if (node.distance > maxRadiusTiles) {
            continue;
        }

        if (node.x < 0 || node.y < 0 || node.x >= mapWidth || node.y >= mapHeight) {
            continue;
        }

        const candidateOffset = {
            x: node.x * TILE_SIZE,
            y: node.y * TILE_SIZE,
        };

        game.player.offset.x = candidateOffset.x;
        game.player.offset.y = candidateOffset.y;
        const collision = runCollisionCheck(game, 'unstick:bfs');
        const collidedItem = game.player.collidedItem;
        game.player.offset.x = originalOffset.x;
        game.player.offset.y = originalOffset.y;
        game.player.collidedItem = originalCollidedItem;

        if (collision === COLLISION_MINE) {
            // Avoid teleporting directly onto hostile mines.
        } else if (!isBlockingCollision(collision)) {
            return { offset: candidateOffset, collision, collidedItem };
        }

        UNSTICK_DIRECTIONS.forEach(({ dx, dy }) => {
            const next = { x: node.x + dx, y: node.y + dy, distance: node.distance + 1 };
            const nextKey = `${next.x},${next.y}`;
            if (!visited.has(nextKey)) {
                queue.push(next);
            }
        });
    }

    return null;
};

const movePlayerToCitySpawn = (game) => {
    if (!game || !game.player) {
        return;
    }
    const spawn = getCitySpawn(game.player.city);
    if (spawn) {
        game.player.offset.x = spawn.x;
        game.player.offset.y = spawn.y;
        return;
    }
    const city = game.cities?.[game.player.city];
    if (city) {
        game.player.offset.x = city.x + 48;
        game.player.offset.y = city.y + 100;
        return;
    }
    game.player.offset.x = 0;
    game.player.offset.y = 0;
};

const ensurePlayerUnstuck = (game) => {
    if (!game || !game.player) {
        return;
    }

    const collision = runCollisionCheck(game, 'ensure:initial');
    if (collision === COLLISION_MINE) {
        handleMineCollision(game, game.player.collidedItem);
        return;
    }
    if (collision === COLLISION_DFG) {
        handleDFGCollision(game, game.player.collidedItem);
        return;
    }

    if (!isBlockingCollision(collision)) {
        updateLastSafeOffset(game);
        return;
    }

    const original = {
        x: game.player.offset.x,
        y: game.player.offset.y
    };
    const fallback = game.player.lastSafeOffset ? {...game.player.lastSafeOffset} : null;

    if (attemptUnstick(game, original)) {
        return;
    }

    const nearestSafe = findNearestSafeOffset(game, original);
    if (nearestSafe) {
        game.player.offset.x = nearestSafe.offset.x;
        game.player.offset.y = nearestSafe.offset.y;
        const collisionAfterNearest = runCollisionCheck(game, 'unstick:nearest_result');
        if (collisionAfterNearest === COLLISION_MINE) {
            handleMineCollision(game, game.player.collidedItem);
            return;
        }
        if (collisionAfterNearest === COLLISION_DFG) {
            handleDFGCollision(game, game.player.collidedItem);
            return;
        }
        if (!isBlockingCollision(collisionAfterNearest)) {
            updateLastSafeOffset(game);
            return;
        }
    }

    if (fallback && (fallback.x !== original.x || fallback.y !== original.y)) {
        game.player.offset.x = fallback.x;
        game.player.offset.y = fallback.y;
        const postFallbackCollision = runCollisionCheck(game, 'unstick:fallback');
        if (postFallbackCollision === COLLISION_MINE) {
            handleMineCollision(game, game.player.collidedItem);
            updateLastSafeOffset(game);
            return;
        }
        if (postFallbackCollision === COLLISION_DFG) {
            handleDFGCollision(game, game.player.collidedItem);
            updateLastSafeOffset(game);
            return;
        }
        if (!isBlockingCollision(postFallbackCollision)) {
            updateLastSafeOffset(game);
            return;
        }
    }

    game.player.offset.x = original.x;
    game.player.offset.y = original.y;

    movePlayerToCitySpawn(game);

    const collisionAtSpawn = runCollisionCheck(game, 'respawn:initial');
    if (collisionAtSpawn === COLLISION_MINE) {
        handleMineCollision(game, game.player.collidedItem);
        return;
    }
    if (collisionAtSpawn === COLLISION_DFG) {
        handleDFGCollision(game, game.player.collidedItem);
        return;
    }
    if (!isBlockingCollision(collisionAtSpawn)) {
        updateLastSafeOffset(game);
        return;
    }

    const safeNearSpawn = findNearestSafeOffset(game, game.player.offset, NEAREST_SAFE_MAX_RADIUS_TILES * 2);
    if (safeNearSpawn) {
        game.player.offset.x = safeNearSpawn.offset.x;
        game.player.offset.y = safeNearSpawn.offset.y;
        const postSpawnCollision = runCollisionCheck(game, 'respawn:post');
        if (postSpawnCollision === COLLISION_MINE) {
            handleMineCollision(game, game.player.collidedItem);
            return;
        }
        if (postSpawnCollision === COLLISION_DFG) {
            handleDFGCollision(game, game.player.collidedItem);
            return;
        }
        if (!isBlockingCollision(postSpawnCollision)) {
            updateLastSafeOffset(game);
            return;
        }
    }

    killPlayer(game);
};

var killPlayer = (game) => {
    game.player.offset.x = 0;
    game.player.offset.y = 0;
    if (game.player.engineLoopActive) {
        game.player.engineLoopActive = false;
    }
    if (game.audio) {
        game.audio.setLoopState(SOUND_IDS.ENGINE, false);
    }
    updateLastSafeOffset(game);
};

export const play = (game) => {
    const lobby = game?.lobby;
    const inLobby = lobby && typeof lobby.isInGame === 'function' ? lobby.isInGame() : true;
    if (!inLobby) {
        if (game.player?.engineLoopActive && game.audio) {
            game.audio.setLoopState(SOUND_IDS.ENGINE, false);
            game.player.engineLoopActive = false;
        }
        return;
    }

    const now = game.tick || Date.now();

    if (game.player.isCloaked && game.player.cloakExpiresAt && now >= game.player.cloakExpiresAt) {
        game.player.isCloaked = false;
        game.player.cloakExpiresAt = 0;
        game.forceDraw = true;
    }

    let isFrozen = false;
    if (game.player.isFrozen) {
        if (!game.player.frozenUntil || now >= game.player.frozenUntil) {
            game.player.isFrozen = false;
            game.player.frozenUntil = 0;
            game.player.frozenBy = null;
        } else {
            isFrozen = true;
        }
    }

    if (game.player.isTurning) {
        turnPlayer(game)
    }

    if (!isFrozen && game.player.isMoving) {
        movePlayer(game);
    } else if (isFrozen) {
        game.player.isMoving = 0;
    }

    applyHospitalHealing(game);

    if (!isFrozen) {
        ensurePlayerUnstuck(game);
    }

    if (game && game.audio && game.player && Number.isFinite(game.player.offset?.x) && Number.isFinite(game.player.offset?.y)) {
        const listenerX = game.player.offset.x + 24;
        const listenerY = game.player.offset.y + 24;
        game.audio.setListenerPosition(listenerX, listenerY);

        const shouldLoopEngine = !isFrozen && !!game.player.isMoving && game.player.health > 0;
        if (shouldLoopEngine && !game.player.engineLoopActive) {
            game.audio.setLoopState(SOUND_IDS.ENGINE, true, { volume: 0.3 });
            game.player.engineLoopActive = true;
        } else if ((!shouldLoopEngine || game.player.health <= 0) && game.player.engineLoopActive) {
            game.audio.setLoopState(SOUND_IDS.ENGINE, false);
            game.player.engineLoopActive = false;
        }
    }

    if (game.player.health === 0) {
        killPlayer(game);
    }
};
