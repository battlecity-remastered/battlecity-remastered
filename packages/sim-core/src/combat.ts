import type { BulletState } from "./bullet.js";

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

export type BulletStepResult =
    | { kind: "none"; bullet: BulletState }
    | { kind: "out_of_bounds"; bulletId: string }
    | { kind: "hit_player"; bulletId: string; playerId: string; nextHealth: number; isDead: boolean }
    | { kind: "hit_building"; bulletId: string; buildingId: string; nextHealth: number; isDemolished: boolean };

const TILE_SIZE = 48;
const PLAYER_HIT_RADIUS = 24;
const BUILDING_HIT_RADIUS = 28;

const sq = (value: number): number => value * value;
const distanceSquared = (ax: number, ay: number, bx: number, by: number): number => {
    return sq(ax - bx) + sq(ay - by);
};

const normalizeDirection = (direction: number): number => {
    const wrapped = direction % 32;
    return wrapped < 0 ? wrapped + 32 : wrapped;
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

export const stepBulletAndResolve = (
    bullet: BulletState,
    dtMs: number,
    mapMaxX: number,
    mapMaxY: number,
    players: Iterable<CombatPlayerState>,
    buildings: Iterable<CombatBuildingState>
): BulletStepResult => {
    const direction = normalizeDirection(bullet.direction);
    const radians = (direction / 32) * (Math.PI * 2);
    const distance = bullet.speed * (dtMs / 1000);
    const nextBullet = {
        ...bullet,
        direction,
        x: bullet.x + (Math.cos(radians) * distance),
        y: bullet.y + (Math.sin(radians) * distance)
    };

    if (nextBullet.x < 0 || nextBullet.y < 0 || nextBullet.x > mapMaxX || nextBullet.y > mapMaxY) {
        return { kind: "out_of_bounds", bulletId: bullet.id };
    }

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

    return { kind: "none", bullet: nextBullet };
};
