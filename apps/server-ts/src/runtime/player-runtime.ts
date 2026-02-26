import {
    advancePointByLegacyHeading32,
    clampToWorld,
    collidesAt,
    findNearestSafePoint,
    normalizeHeading32,
    tileToRect,
    type BlockingRect,
    type CollisionPoint,
    type CollisionWorld,
    type CombatPlayerState
} from "@battlecity/sim-core";
import type { KnownEventPayloadByType } from "@battlecity/protocol";
import type { RuntimeConfig, RuntimePlayer, RuntimeState } from "./types.js";

const PLAYER_RADIUS = 12;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;
const BUILDING_FOOTPRINT_TILES = 3;
const MAP_COLLISION_RADIUS_TILES = 14;

const resolveBlockingHeightTiles = (buildingType: number): number => {
    if (!Number.isFinite(buildingType)) {
        return BUILDING_FOOTPRINT_TILES;
    }
    if (buildingType === 0) {
        return 2;
    }
    if (buildingType >= 100) {
        const family = Math.floor(buildingType / 100);
        return family <= 2 ? 2 : BUILDING_FOOTPRINT_TILES;
    }
    return BUILDING_FOOTPRINT_TILES;
};

const toCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x + PLAYER_SPRITE_HALF,
        y: y + PLAYER_SPRITE_HALF
    };
};

const fromCollisionPoint = (x: number, y: number): CollisionPoint => {
    return {
        x: x - PLAYER_SPRITE_HALF,
        y: y - PLAYER_SPRITE_HALF
    };
};

const clampTopLeftToWorld = (x: number, y: number, mapMax: number): CollisionPoint => {
    const max = mapMax - PLAYER_SPRITE_SIZE;
    return {
        x: Math.max(0, Math.min(max, x)),
        y: Math.max(0, Math.min(max, y))
    };
};

const collectBlockingRects = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld["blocks"] => {
    const blocks: BlockingRect[] = [];

    for (const building of state.buildings.values()) {
        const blockingHeightTiles = resolveBlockingHeightTiles(building.type);
        blocks.push({
            x: building.tileX * config.tileSize,
            y: building.tileY * config.tileSize,
            width: config.tileSize * BUILDING_FOOTPRINT_TILES,
            height: config.tileSize * blockingHeightTiles
        });
    }

    for (const defense of state.defenses.values()) {
        blocks.push(tileToRect(defense.tileX, defense.tileY, config.tileSize));
    }

    const mapSize = Math.max(1, Math.floor(config.mapMax / config.tileSize));
    const centerTileX = Math.floor(centerX / config.tileSize);
    const centerTileY = Math.floor(centerY / config.tileSize);
    const minTileX = Math.max(0, centerTileX - MAP_COLLISION_RADIUS_TILES);
    const minTileY = Math.max(0, centerTileY - MAP_COLLISION_RADIUS_TILES);
    const maxTileX = Math.min(mapSize - 1, centerTileX + MAP_COLLISION_RADIUS_TILES);
    const maxTileY = Math.min(mapSize - 1, centerTileY + MAP_COLLISION_RADIUS_TILES);

    for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
        for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
            if (!state.blockingTiles.has(`${tileX},${tileY}`)) {
                continue;
            }
            blocks.push(tileToRect(tileX, tileY, config.tileSize));
        }
    }

    return blocks;
};

const buildCollisionWorld = (
    state: RuntimeState,
    config: RuntimeConfig,
    centerX: number,
    centerY: number
): CollisionWorld => {
    return {
        maxX: config.mapMax,
        maxY: config.mapMax,
        blocks: collectBlockingRects(state, config, centerX, centerY)
    };
};

const resolveStuckPlayerPosition = (
    world: CollisionWorld,
    current: CollisionPoint
): CollisionPoint => {
    if (!collidesAt(world, current, PLAYER_RADIUS)) {
        return current;
    }
    const nearest = findNearestSafePoint(world, current, PLAYER_RADIUS, 8, 192);
    return nearest ?? clampToWorld(world, current, PLAYER_RADIUS);
};

const movePlayerWithCollision = (
    world: CollisionWorld,
    current: CollisionPoint,
    desired: CollisionPoint
): CollisionPoint => {
    const clampedDesired = clampToWorld(world, desired, PLAYER_RADIUS);
    if (!collidesAt(world, clampedDesired, PLAYER_RADIUS)) {
        return clampedDesired;
    }

    const slideX = clampToWorld(world, { x: clampedDesired.x, y: current.y }, PLAYER_RADIUS);
    if (!collidesAt(world, slideX, PLAYER_RADIUS)) {
        return slideX;
    }

    const slideY = clampToWorld(world, { x: current.x, y: clampedDesired.y }, PLAYER_RADIUS);
    if (!collidesAt(world, slideY, PLAYER_RADIUS)) {
        return slideY;
    }

    return clampToWorld(world, current, PLAYER_RADIUS);
};

const resolveMovementThrottle = (payload: KnownEventPayloadByType["player.update"]): number => {
    if (!payload.isMoving) {
        return 0;
    }
    const throttle = payload.throttle;
    if (typeof throttle !== "number" || !Number.isFinite(throttle)) {
        return 1;
    }
    if (throttle > 0) {
        return 1;
    }
    if (throttle < 0) {
        return -1;
    }
    return 0;
};

const makeDefaultPlayer = (
    socketId: string,
    city: number,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): RuntimePlayer => {
    return {
        id: socketId,
        city,
        x: payload.offset.x,
        y: payload.offset.y,
        direction: normalizeHeading32(payload.direction),
        speed: config.playerSpeed,
        health: 100,
        maxHealth: 100
    };
};

export const upsertPlayerFromUpdate = (
    state: RuntimeState,
    socketId: string,
    city: number,
    payload: KnownEventPayloadByType["player.update"],
    config: RuntimeConfig
): void => {
    const current = state.players.get(socketId) ?? makeDefaultPlayer(socketId, city, payload, config);
    const nowMs = Date.now();
    const frozenUntil = Number.isFinite(current.frozenUntil) ? current.frozenUntil as number : 0;
    const isFrozen = frozenUntil > nowMs;
    const withDirection: RuntimePlayer = {
        ...current,
        city,
        speed: config.playerSpeed,
        direction: isFrozen ? current.direction : normalizeHeading32(payload.direction)
    };
    const movementThrottle = resolveMovementThrottle(payload);
    const currentCenter = toCollisionPoint(withDirection.x, withDirection.y);
    const collisionWorld = buildCollisionWorld(state, config, currentCenter.x, currentCenter.y);
    const currentSafeCenter = resolveStuckPlayerPosition(collisionWorld, currentCenter);

    const moved = movementThrottle !== 0 && !isFrozen
        ? (() => {
            const advanced = advancePointByLegacyHeading32(
                currentSafeCenter.x,
                currentSafeCenter.y,
                withDirection.direction,
                withDirection.speed * movementThrottle,
                config.serverStepMs
            );
            const resolvedCenter = movePlayerWithCollision(collisionWorld, currentSafeCenter, advanced);
            const resolvedTopLeft = fromCollisionPoint(resolvedCenter.x, resolvedCenter.y);
            const clampedTopLeft = clampTopLeftToWorld(resolvedTopLeft.x, resolvedTopLeft.y, config.mapMax);
            return {
                ...withDirection,
                x: clampedTopLeft.x,
                y: clampedTopLeft.y,
                city,
                health: current.health,
                maxHealth: current.maxHealth
            };
        })()
        : (() => {
            const safeTopLeft = fromCollisionPoint(currentSafeCenter.x, currentSafeCenter.y);
            const clampedTopLeft = clampTopLeftToWorld(safeTopLeft.x, safeTopLeft.y, config.mapMax);
            return {
                ...withDirection,
                x: clampedTopLeft.x,
                y: clampedTopLeft.y
            };
        })();

    if (!isFrozen && frozenUntil > 0) {
        delete moved.frozenUntil;
        delete moved.frozenBy;
    }

    state.players.set(socketId, moved);
};

export const removeOwnedBullets = (state: RuntimeState, ownerId: string): string[] => {
    const removedIds: string[] = [];
    for (const [bulletId, bullet] of state.bullets.entries()) {
        if (bullet.ownerId !== ownerId) {
            continue;
        }
        removedIds.push(bulletId);
        state.bullets.delete(bulletId);
    }
    return removedIds;
};

export const removePlayer = (state: RuntimeState, playerId: string): string[] => {
    state.players.delete(playerId);
    return removeOwnedBullets(state, playerId);
};

export const asCombatPlayers = (state: RuntimeState): Iterable<CombatPlayerState> => {
    return state.players.values() as Iterable<CombatPlayerState>;
};
