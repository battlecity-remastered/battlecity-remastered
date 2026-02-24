export const BUILDING_BASE_FRAME_SIZE = 144;
export const BUILDING_ANIM_START_X = 144;
export const BUILDING_ANIM_COUNT_X = 3;
export const BUILDING_ANIM_DIVISOR = 4;

export const FACTORY_OVERLAY_OFFSET = { x: 56, y: 52 };
export const RESEARCH_OVERLAY_OFFSET = { x: 14, y: 98 };

export const resolveBuildingBaseType = (buildingType: number): number => {
    return Math.max(0, Math.floor(buildingType / 100));
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

export const resolveBuildingOverlay = (buildingType: number): { iconIndex: number; offset: { x: number; y: number } } | null => {
    const baseType = resolveBuildingBaseType(buildingType);
    if (baseType === 1) {
        return { iconIndex: 1, offset: FACTORY_OVERLAY_OFFSET };
    }
    if (baseType === 2) {
        return { iconIndex: 2, offset: RESEARCH_OVERLAY_OFFSET };
    }
    return null;
};

export const resolveCommandCenterLabelPosition = (tileX: number, tileY: number): { x: number; y: number } => {
    return {
        x: (tileX + 1.5) * 48,
        y: ((tileY + 1.5) * 48) - 32
    };
};
