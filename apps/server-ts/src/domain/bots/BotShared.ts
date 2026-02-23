import citySpawns from "../../../data/citySpawns.json" with { type: "json" };
import { normalizeHeading32 } from "@battlecity/sim-core";
import type { RuntimeConfig, RuntimeState } from "../../runtime/types.js";

type CitySpawn = {
    tileX?: number;
    tileY?: number;
};

const CITY_SPAWNS = citySpawns as Record<string, CitySpawn>;

const toFinite = (value: unknown): number | null => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        return null;
    }
    return value;
};

export const resolveCityCenter = (cityId: number, config: RuntimeConfig): { x: number; y: number } => {
    const fromMap = CITY_SPAWNS[String(cityId)];
    const tileX = toFinite(fromMap?.tileX);
    const tileY = toFinite(fromMap?.tileY);
    if (tileX !== null && tileY !== null) {
        return {
            x: (Math.floor(tileX) * config.tileSize) + (config.tileSize * 1.5),
            y: (Math.floor(tileY) * config.tileSize) + (config.tileSize * 1.5)
        };
    }

    const side = Math.max(1, Math.round(Math.sqrt(Math.max(1, config.cityCount))));
    const gx = cityId % side;
    const gy = Math.floor(cityId / side);
    return {
        x: (gx + 1.5) * config.tileSize * 6,
        y: (gy + 1.5) * config.tileSize * 6
    };
};

export const nearestHumanPlayer = (
    state: RuntimeState,
    x: number,
    y: number,
    maxDistance: number,
    cityId?: number
): { id: string; x: number; y: number; city: number } | null => {
    let nearest: { id: string; x: number; y: number; city: number } | null = null;
    let nearestDistance = maxDistance * maxDistance;

    for (const player of state.players.values()) {
        if (player.isBot) {
            continue;
        }
        if (cityId !== undefined && player.city !== cityId) {
            continue;
        }
        const dx = player.x - x;
        const dy = player.y - y;
        const distance = (dx * dx) + (dy * dy);
        if (distance >= nearestDistance) {
            continue;
        }
        nearestDistance = distance;
        nearest = {
            id: player.id,
            x: player.x,
            y: player.y,
            city: player.city
        };
    }

    return nearest;
};

export const headingToTarget = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    fallback: number
): number => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) {
        return normalizeHeading32(fallback);
    }
    const radians = Math.atan2(dy, dx);
    const direction = Math.round((radians / (Math.PI * 2)) * 32);
    return normalizeHeading32(direction);
};
