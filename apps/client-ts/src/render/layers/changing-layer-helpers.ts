import {
    isCommandCenterType as isCommandCenterTypeShared,
    isFactoryType as isFactoryTypeShared,
    resolveBuildingBaseType as resolveBaseType
} from "@battlecity/sim-core";

const TILE = 48;

export const isCommandCenterType = (buildingType: number): boolean => {
    return isCommandCenterTypeShared(buildingType);
};

export const isFactoryType = (buildingType: number): boolean => {
    return isFactoryTypeShared(buildingType);
};

export const resolveSmokeFrame = (nowMs: number): number => {
    return Math.floor(nowMs / 120) % 8;
};

export const resolvePopulationMax = (buildingType: number): number => {
    const baseType = resolveBaseType(buildingType);
    return baseType === 3 ? 100 : 50;
};

export const resolvePopulationFrame = (buildingType: number, population: number): { row: number; column: number } => {
    const maxPopulation = Math.max(1, resolvePopulationMax(buildingType));
    const normalized = Math.max(0, Math.min(maxPopulation, population));
    return {
        row: isCommandCenterType(buildingType) ? 1 : 0,
        column: Math.min(6, Math.floor((normalized / maxPopulation) * 6))
    };
};

export const resolvePopulationOffset = (buildingType: number): { x: number; y: number } => {
    if (isCommandCenterType(buildingType)) {
        return { x: 96, y: 49 };
    }
    const baseType = resolveBaseType(buildingType);
    if (baseType === 1 || baseType === 2) {
        return { x: 96, y: 48 };
    }
    if (baseType === 3 || baseType === 4) {
        return { x: 96, y: 90 };
    }
    return { x: 96, y: 48 };
};

export const resolveResearchStripPlacement = (tileX: number, tileY: number): {
    sourceX: number;
    sourceY: number;
    sourceWidth: number;
    sourceHeight: number;
    x: number;
    y: number;
    width: number;
    height: number;
} => {
    const scaledHeight = 121;
    return {
        sourceX: 0,
        sourceY: 5,
        sourceWidth: 10,
        sourceHeight: 134,
        x: (tileX * TILE) + 130,
        y: (tileY * TILE) + Math.floor((144 - scaledHeight) / 2) - 5,
        width: 9,
        height: scaledHeight
    };
};

export const resolveSmokePlacement = (tileX: number, tileY: number): { x: number; y: number; width: number; height: number } => {
    return {
        x: (tileX * TILE) + 6,
        y: (tileY * TILE) - 15,
        width: 180,
        height: 60
    };
};

export const resolveFactoryDigits = (itemCount: number): {
    tens: number;
    ones: number;
    tensOffset: { x: number; y: number };
    onesOffset: { x: number; y: number };
} => {
    const clamped = Math.max(0, Math.min(99, Math.floor(itemCount)));
    return {
        tens: Math.floor(clamped / 10),
        ones: clamped % 10,
        tensOffset: { x: 56, y: 84 },
        onesOffset: { x: 72, y: 84 }
    };
};
