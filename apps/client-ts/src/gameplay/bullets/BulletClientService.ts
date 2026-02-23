import { advanceBullet } from "@battlecity/sim-core";
import type { ClientState } from "../../app/state.js";

const MAP_MAX = 24576;
const LASER_BULLET_SPEED = 720;
const FLARE_BULLET_SPEED = 560;

export const resolveBulletSpeed = (type: number): number => {
    if (type === 3) {
        return FLARE_BULLET_SPEED;
    }
    return LASER_BULLET_SPEED;
};

export const stepClientBullets = (state: ClientState, dtMs: number): void => {
    for (const bullet of state.bullets.values()) {
        const next = advanceBullet(
            {
                id: bullet.id,
                ownerId: bullet.ownerId,
                city: bullet.city,
                x: bullet.x,
                y: bullet.y,
                direction: bullet.direction,
                speed: bullet.speed,
                type: bullet.type
            },
            dtMs,
            MAP_MAX,
            MAP_MAX
        );
        bullet.x = next.x;
        bullet.y = next.y;
        bullet.direction = next.direction;
    }
};
