import { clamp } from "./geometry.js";

export type PlayerState = {
    id: string;
    x: number;
    y: number;
    direction: number;
    speed: number;
};

export const advancePlayer = (
    player: PlayerState,
    dtMs: number,
    mapMaxX: number,
    mapMaxY: number
): PlayerState => {
    const radians = (player.direction / 32) * (Math.PI * 2);
    const distance = player.speed * (dtMs / 1000);
    const nextX = clamp(player.x + (Math.cos(radians) * distance), 0, mapMaxX);
    const nextY = clamp(player.y + (Math.sin(radians) * distance), 0, mapMaxY);
    return {
        ...player,
        x: nextX,
        y: nextY
    };
};
