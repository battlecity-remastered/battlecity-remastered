import type { BulletState } from "./bullet.js";
import { advancePointByHeading32, normalizeHeading32 } from "./motion.js";

export type CombatPlayerState = {
    id: string;
    city: number;
    x: number;
    y: number;
    health: number;
    maxHealth: number;
};

export type CombatBuildingState = {
    id: string;
    cityId: number;
    tileX: number;
    tileY: number;
    health: number;
    maxHealth: number;
};

export type CombatHazardState = {
    id: string;
    x: number;
    y: number;
    radius: number;
};

export type BulletStepResult =
    | { kind: "none"; bullet: BulletState }
    | { kind: "out_of_bounds"; bulletId: string }
    | { kind: "hit_terrain"; bulletId: string }
    | { kind: "hit_player"; bulletId: string; playerId: string; nextHealth: number; isDead: boolean }
    | { kind: "hit_building"; bulletId: string; buildingId: string; nextHealth: number; isDemolished: boolean }
    | { kind: "hit_hazard"; bulletId: string; hazardId: string };

const TILE_SIZE = 48;
const PLAYER_HIT_RADIUS = 24;
const BULLET_SIZE = 4;
const TERRAIN_SAMPLE_STEP_PX = 8;

const sq = (value: number): number => value * value;
const distanceSquared = (ax: number, ay: number, bx: number, by: number): number => {
    return sq(ax - bx) + sq(ay - by);
};

type Rect = {
    x: number;
    y: number;
    width: number;
    height: number;
};

const intersectsRect = (left: Rect, right: Rect): boolean => {
    if ((left.x + left.width) <= right.x) {
        return false;
    }
    if ((right.x + right.width) <= left.x) {
        return false;
    }
    if ((left.y + left.height) <= right.y) {
        return false;
    }
    if ((right.y + right.height) <= left.y) {
        return false;
    }
    return true;
};

const resolveBulletRect = (bullet: BulletState): Rect => {
    return {
        x: bullet.x,
        y: bullet.y,
        width: BULLET_SIZE,
        height: BULLET_SIZE
    };
};

const bulletDamage = (bulletType: number): number => {
    switch (bulletType) {
        case 2:
            return 35;
        default:
            return 20;
    }
};

const resolvePlayerHit = (
    nextBullet: BulletState,
    bullet: BulletState,
    players: Iterable<CombatPlayerState>
): BulletStepResult | undefined => {
    const playerRadiusSq = sq(PLAYER_HIT_RADIUS);
    for (const player of players) {
        if (player.id === bullet.ownerId || player.city === bullet.city || player.health <= 0) {
            continue;
        }
        if (distanceSquared(nextBullet.x, nextBullet.y, player.x, player.y) <= playerRadiusSq) {
            const nextHealth = Math.max(0, player.health - bulletDamage(bullet.type));
            return {
                kind: "hit_player",
                bulletId: bullet.id,
                playerId: player.id,
                nextHealth,
                isDead: nextHealth <= 0
            };
        }
    }
    return undefined;
};

const resolveBuildingHit = (
    nextBullet: BulletState,
    bullet: BulletState,
    buildings: Iterable<CombatBuildingState>
): BulletStepResult | undefined => {
    const bulletRect = resolveBulletRect(nextBullet);
    for (const building of buildings) {
        if (building.health <= 0) {
            continue;
        }
        const structureRect = {
            x: building.tileX * TILE_SIZE,
            y: building.tileY * TILE_SIZE,
            width: TILE_SIZE,
            height: TILE_SIZE
        };
        if (!intersectsRect(bulletRect, structureRect)) {
            continue;
        }
        const nextHealth = Math.max(0, building.health - bulletDamage(bullet.type));
        return {
            kind: "hit_building",
            bulletId: bullet.id,
            buildingId: building.id,
            nextHealth,
            isDemolished: nextHealth <= 0
        };
    }
    return undefined;
};

const resolveHazardHit = (
    nextBullet: BulletState,
    bulletId: string,
    hazards: Iterable<CombatHazardState>
): BulletStepResult | undefined => {
    const bulletRect = resolveBulletRect(nextBullet);
    for (const hazard of hazards) {
        const size = Math.max(16, Number.isFinite(hazard.radius) ? hazard.radius : TILE_SIZE);
        const hazardRect = {
            x: hazard.x - (size / 2),
            y: hazard.y - (size / 2),
            width: size,
            height: size
        };
        if (!intersectsRect(bulletRect, hazardRect)) {
            continue;
        }
        return {
            kind: "hit_hazard",
            bulletId,
            hazardId: hazard.id
        };
    }
    return undefined;
};

const resolveTerrainHit = (
    previousBullet: BulletState,
    nextBullet: BulletState,
    bulletId: string,
    isBlockedTile?: (tileX: number, tileY: number) => boolean
): BulletStepResult | undefined => {
    if (!isBlockedTile) {
        return undefined;
    }

    const dx = nextBullet.x - previousBullet.x;
    const dy = nextBullet.y - previousBullet.y;
    const travelDistance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(travelDistance / TERRAIN_SAMPLE_STEP_PX));

    for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        const sampleX = previousBullet.x + (dx * t);
        const sampleY = previousBullet.y + (dy * t);
        const corners = [
            { x: sampleX, y: sampleY },
            { x: sampleX + (BULLET_SIZE - 1), y: sampleY },
            { x: sampleX, y: sampleY + (BULLET_SIZE - 1) },
            { x: sampleX + (BULLET_SIZE - 1), y: sampleY + (BULLET_SIZE - 1) }
        ];

        for (const corner of corners) {
            const tileX = Math.floor(corner.x / TILE_SIZE);
            const tileY = Math.floor(corner.y / TILE_SIZE);
            if (isBlockedTile(tileX, tileY)) {
                return {
                    kind: "hit_terrain",
                    bulletId
                };
            }
        }
    }

    return undefined;
};

export const stepBulletAndResolve = (
    bullet: BulletState,
    dtMs: number,
    mapMaxX: number,
    mapMaxY: number,
    players: Iterable<CombatPlayerState>,
    buildings: Iterable<CombatBuildingState>,
    hazards: Iterable<CombatHazardState> = [],
    isBlockedTile?: (tileX: number, tileY: number) => boolean
): BulletStepResult => {
    const direction = normalizeHeading32(bullet.direction);
    const advanced = advancePointByHeading32(bullet.x, bullet.y, direction, bullet.speed, dtMs);
    const nextBullet = {
        ...bullet,
        direction,
        x: advanced.x,
        y: advanced.y
    };

    if (nextBullet.x < 0 || nextBullet.y < 0 || nextBullet.x > mapMaxX || nextBullet.y > mapMaxY) {
        return { kind: "out_of_bounds", bulletId: bullet.id };
    }

    const terrainHit = resolveTerrainHit(bullet, nextBullet, bullet.id, isBlockedTile);
    if (terrainHit) {
        return terrainHit;
    }

    const playerHit = resolvePlayerHit(nextBullet, bullet, players);
    if (playerHit) {
        return playerHit;
    }

    const buildingHit = resolveBuildingHit(nextBullet, bullet, buildings);
    if (buildingHit) {
        return buildingHit;
    }

    const hazardHit = resolveHazardHit(nextBullet, bullet.id, hazards);
    if (hazardHit) {
        return hazardHit;
    }

    return { kind: "none", bullet: nextBullet };
};
