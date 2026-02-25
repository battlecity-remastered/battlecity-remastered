import type { ClientState } from "../app/state.js";
import { getCityDisplayName } from "../world/city-spawn.js";
import { isCommandCenterType } from "./layers/changing-layer-helpers.js";
import { TILE } from "./parity/constants.js";

export type NearestOrbableCity = {
    cityId: number;
    cityName: string;
    distanceTiles: number;
    direction: "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW" | "HERE";
};

const resolveDirection = (dx: number, dy: number): NearestOrbableCity["direction"] => {
    const threshold = TILE / 3;
    const vertical = dy <= -threshold ? "N" : (dy >= threshold ? "S" : "");
    const horizontal = dx <= -threshold ? "W" : (dx >= threshold ? "E" : "");
    const direction = `${vertical}${horizontal}`;
    if (direction.length === 0) {
        return "HERE";
    }
    return direction as NearestOrbableCity["direction"];
};

const resolveBuildingCenter = (tileX: number, tileY: number): { x: number; y: number } => {
    return {
        x: (tileX + 1.5) * TILE,
        y: (tileY + 1.5) * TILE
    };
};

export const resolveNearestOrbableCity = (state: ClientState): NearestOrbableCity | null => {
    const localCenterX = state.local.x + (TILE / 2);
    const localCenterY = state.local.y + (TILE / 2);
    let nearest: {
        cityId: number;
        dx: number;
        dy: number;
        distanceSquared: number;
    } | null = null;

    for (const building of state.buildings.values()) {
        if (building.cityId === state.local.city) {
            continue;
        }
        if (!isCommandCenterType(building.type)) {
            continue;
        }
        const center = resolveBuildingCenter(building.tileX, building.tileY);
        const dx = center.x - localCenterX;
        const dy = center.y - localCenterY;
        const distanceSquared = (dx * dx) + (dy * dy);
        if (!nearest || distanceSquared < nearest.distanceSquared) {
            nearest = {
                cityId: building.cityId,
                dx,
                dy,
                distanceSquared
            };
        }
    }

    if (!nearest) {
        return null;
    }

    return {
        cityId: nearest.cityId,
        cityName: getCityDisplayName(nearest.cityId),
        distanceTiles: Math.max(0, Math.round(Math.sqrt(nearest.distanceSquared) / TILE)),
        direction: resolveDirection(nearest.dx, nearest.dy)
    };
};

export const formatNearestOrbableCityLine = (target: NearestOrbableCity | null): string => {
    if (!target) {
        return "";
    }
    return `Nearest orbable city: ${target.cityName} (C${target.cityId}) ${target.direction} ${target.distanceTiles}t`;
};
