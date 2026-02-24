const COMMAND_CENTER_TYPES = new Set([200, 201]);
const FACTORY_TYPES = new Set([100, 101, 102]);

export const isCommandCenterType = (buildingType: number): boolean => {
    return COMMAND_CENTER_TYPES.has(buildingType);
};

export const isFactoryType = (buildingType: number): boolean => {
    return FACTORY_TYPES.has(buildingType);
};

export const resolveSmokeFrame = (nowMs: number): number => {
    return Math.floor(nowMs / 120) % 8;
};
