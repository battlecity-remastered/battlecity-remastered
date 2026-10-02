import { TILE_SIZE } from "../../gameplay/world-viewport.js";
import { resolveCitySpawn } from "../../world/city-spawn.js";

export type RadarPoint = { x: number; y: number };
export type RadarMap = {
    map: ReadonlyArray<ReadonlyArray<number>>;
    buildings: ReadonlyArray<{ tileX: number; tileY: number; kind: string }>;
    defenses: ReadonlyArray<{ tileX: number; tileY: number }>;
};

export const resolveRadarNavigation = (x: number, y: number, direction: number, city: number) => {
    const home = resolveCitySpawn(city) ?? resolveCitySpawn(0)!;
    const player = { x: (x + TILE_SIZE / 2) / TILE_SIZE, y: (y + TILE_SIZE / 2) / TILE_SIZE };
    const destination = { x: home.tileX + 1.5, y: home.tileY + 1 };
    const dx = destination.x - player.x, dy = destination.y - player.y;
    const distance = Math.hypot(dx, dy);
    const bearing = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;
    const compass = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(bearing / 45) % 8]!;
    return { player, home: destination, homeName: home.name, distance, bearing, compass, heading: ((direction * 360 / 32) % 360 + 360) % 360 };
};

// North-up local radar; distant home stays pinned to the circular rim.
export const projectRadarPoint = (point: RadarPoint, center: RadarPoint, range = 24, radius = 42) => {
    const dx = (point.x - center.x) * radius / range;
    const dy = (point.y - center.y) * radius / range;
    const length = Math.hypot(dx, dy);
    const gain = length > radius ? radius / length : 1;
    return { x: 50 + dx * gain, y: 50 + dy * gain, outside: length > radius };
};
