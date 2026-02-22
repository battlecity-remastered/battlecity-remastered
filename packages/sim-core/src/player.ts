import { clamp } from "./geometry.js";
import { advancePointByHeading32, normalizeHeading32 } from "./motion.js";

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
    const advanced = advancePointByHeading32(player.x, player.y, player.direction, player.speed, dtMs);
    const nextX = clamp(advanced.x, 0, mapMaxX);
    const nextY = clamp(advanced.y, 0, mapMaxY);
    return {
        ...player,
        direction: normalizeHeading32(player.direction),
        x: nextX,
        y: nextY
    };
};
