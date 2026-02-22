import { clamp } from "./geometry.js";
import { advancePointByHeading32, normalizeHeading32 } from "./motion.js";

export type BulletState = {
    id: string;
    ownerId: string;
    city: number;
    x: number;
    y: number;
    direction: number;
    speed: number;
    type: number;
};

export const advanceBullet = (
    bullet: BulletState,
    dtMs: number,
    mapMaxX: number,
    mapMaxY: number
): BulletState => {
    const advanced = advancePointByHeading32(bullet.x, bullet.y, bullet.direction, bullet.speed, dtMs);
    const nextX = clamp(advanced.x, 0, mapMaxX);
    const nextY = clamp(advanced.y, 0, mapMaxY);
    return {
        ...bullet,
        direction: normalizeHeading32(bullet.direction),
        x: nextX,
        y: nextY
    };
};
