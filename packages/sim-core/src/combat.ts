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
const BUILDING_HIT_RADIUS = 28;
const BULLET_SIZE = 4;

const sq = (value: number): number => value * value;
const distanceSquared = (ax: number, ay: number, bx: number, by: number): number => {
    return sq(ax - bx) + sq(ay - by);
};

const bulletDamage = (bulletType: number): number => {
    switch (bulletType) {
        case 2:
            return 35;
        default:
            return 20;
    }
};

const buildingCenter = (building: CombatBuildingState): { x: number; y: number } => {
    return {
        x: (building.tileX * TILE_SIZE) + (TILE_SIZE / 2),
        y: (building.tileY * TILE_SIZE) + (TILE_SIZE / 2)
    };
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
    const buildingRadiusSq = sq(BUILDING_HIT_RADIUS);
    for (const building of buildings) {
        if (building.cityId === bullet.city || building.health <= 0) {
            continue;
        }
        const center = buildingCenter(building);
        if (distanceSquared(nextBullet.x, nextBullet.y, center.x, center.y) <= buildingRadiusSq) {
            const nextHealth = Math.max(0, building.health - bulletDamage(bullet.type));
            return {
                kind: "hit_building",
                bulletId: bullet.id,
                buildingId: building.id,
                nextHealth,
                isDemolished: nextHealth <= 0
            };
        }
    }
    return undefined;
};

const resolveHazardHit = (
    nextBullet: BulletState,
    bulletId: string,
    hazards: Iterable<CombatHazardState>
): BulletStepResult | undefined => {
    for (const hazard of hazards) {
        const radius = Math.max(16, hazard.radius * 0.5);
        if (distanceSquared(nextBullet.x, nextBullet.y, hazard.x, hazard.y) <= sq(radius)) {
            return {
                kind: "hit_hazard",
                bulletId,
                hazardId: hazard.id
            };
        }
    }
    return undefined;
};

const resolveTerrainHit = (
    nextBullet: BulletState,
    bulletId: string,
    isBlockedTile?: (tileX: number, tileY: number) => boolean
): BulletStepResult | undefined => {
    if (!isBlockedTile) {
        return undefined;
    }

    const corners = [
        { x: nextBullet.x, y: nextBullet.y },
        { x: nextBullet.x + (BULLET_SIZE - 1), y: nextBullet.y },
        { x: nextBullet.x, y: nextBullet.y + (BULLET_SIZE - 1) },
        { x: nextBullet.x + (BULLET_SIZE - 1), y: nextBullet.y + (BULLET_SIZE - 1) }
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

    const terrainHit = resolveTerrainHit(nextBullet, bullet.id, isBlockedTile);
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
