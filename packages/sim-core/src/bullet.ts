import { clamp } from "./geometry.js";

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
    const radians = (bullet.direction / 32) * (Math.PI * 2);
    const distance = bullet.speed * (dtMs / 1000);
    const nextX = clamp(bullet.x + (Math.cos(radians) * distance), 0, mapMaxX);
    const nextY = clamp(bullet.y + (Math.sin(radians) * distance), 0, mapMaxY);
    return {
        ...bullet,
        x: nextX,
        y: nextY
    };
};
