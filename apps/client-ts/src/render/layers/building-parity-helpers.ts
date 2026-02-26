export const BUILDING_BASE_FRAME_SIZE = 144;
export const BUILDING_ANIM_START_X = 0;
export const BUILDING_ANIM_COUNT_X = 3;
export const BUILDING_ANIM_DIVISOR = 4;

export const FACTORY_OVERLAY_OFFSET = { x: 56, y: 52 };
export const RESEARCH_OVERLAY_OFFSET = { x: 14, y: 98 };

export const resolveBuildingBaseType = (buildingType: number): number => {
    const numeric = Number(buildingType);
    if (!Number.isFinite(numeric)) {
        return -1;
    }
    if (numeric === 0) {
        return 0;
    }
    if (numeric < 100) {
        return -1;
    }
    return Math.floor(numeric / 100);
};

export const resolveBuildingBaseFrame = (buildingType: number): { x: number; y: number; width: number; height: number } => {
    return {
        x: 0,
        y: resolveBuildingBaseType(buildingType) * BUILDING_BASE_FRAME_SIZE,
        width: BUILDING_BASE_FRAME_SIZE,
        height: BUILDING_BASE_FRAME_SIZE
    };
};

export const resolveBuildingAnimationFrameX = (frameCounter: number): number => {
    const animFrame = Math.floor(frameCounter / BUILDING_ANIM_DIVISOR) % BUILDING_ANIM_COUNT_X;
    return BUILDING_ANIM_START_X + (animFrame * BUILDING_BASE_FRAME_SIZE);
};

const resolveOverlayIconIndex = (buildingType: number): number | null => {
    const baseType = resolveBuildingBaseType(buildingType);
    if (baseType === 1) {
        const factorySubtype = buildingType - 100;
        if (factorySubtype >= 0 && factorySubtype <= 12) {
            return factorySubtype;
        }
        return null;
    }
    if (baseType === 4) {
        if (buildingType === 413 || buildingType === 408) {
            return 8;
        }
        const researchSubtype = buildingType - 400;
        if (researchSubtype >= 0 && researchSubtype <= 12) {
            return researchSubtype;
        }
        return null;
    }
    return null;
};

export const resolveBuildingOverlay = (buildingType: number): { iconIndex: number; offset: { x: number; y: number } } | null => {
    const baseType = resolveBuildingBaseType(buildingType);
    if (baseType === 1) {
        const iconIndex = resolveOverlayIconIndex(buildingType);
        if (iconIndex === null) {
            return null;
        }
        return { iconIndex, offset: FACTORY_OVERLAY_OFFSET };
    }
    if (baseType === 4) {
        const iconIndex = resolveOverlayIconIndex(buildingType);
        if (iconIndex === null) {
            return null;
        }
        return { iconIndex, offset: RESEARCH_OVERLAY_OFFSET };
    }
    return null;
};

export const resolveCommandCenterLabelPosition = (tileX: number, tileY: number): { x: number; y: number } => {
    return {
        x: (tileX + 1.5) * 48,
        y: ((tileY + 1.5) * 48) - 32
    };
};
