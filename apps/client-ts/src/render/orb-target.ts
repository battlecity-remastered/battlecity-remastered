import type { ClientState } from "../app/state.js";
import { getCityDisplayName } from "../world/city-spawn.js";
import { isCommandCenterType } from "./layers/changing-layer-helpers.js";
import { TILE } from "./parity/constants.js";

export type NearestOrbableCity = {
    cityId: number;
    cityName: string;
    distanceTiles: number;
    direction: string;
};

const resolveDirectionLabel = (dx: number, dy: number): string => {
    const threshold = TILE;
    let horizontal = "";
    let vertical = "";
    if (Math.abs(dx) > threshold) {
        horizontal = dx > 0 ? "east" : "west";
    }
    if (Math.abs(dy) > threshold) {
        vertical = dy > 0 ? "south" : "north";
    }
    if (horizontal && vertical) {
        return `${vertical}-${horizontal}`;
    }
    if (vertical) {
        return vertical;
    }
    if (horizontal) {
        return horizontal;
    }
    return "nearby";
};

const formatDirectionLabel = (label: string): string => {
    if (!label) {
        return "Nearby";
    }
    return label
        .split("-")
        .map((part) => {
            if (!part) {
                return part;
            }
            return `${part.charAt(0).toUpperCase()}${part.slice(1)}`;
        })
        .join("-");
};

const resolveBuildingCenter = (tileX: number, tileY: number): { x: number; y: number } => {
    return {
        x: (tileX + 1.5) * TILE,
        y: (tileY + 1) * TILE
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
        if (state.cityFinance.get(building.cityId)?.isOrbable !== true) {
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
        direction: formatDirectionLabel(resolveDirectionLabel(nearest.dx, nearest.dy))
    };
};

export const formatNearestOrbableCityLine = (target: NearestOrbableCity | null): string => {
    if (!target) {
        return "No orbable cities detected yet.";
    }
    const distanceLabel = target.distanceTiles > 1 ? ` (~${target.distanceTiles} tiles)` : "";
    return `Nearest orbable city: ${target.cityName} - ${target.direction}${distanceLabel}`;
};
