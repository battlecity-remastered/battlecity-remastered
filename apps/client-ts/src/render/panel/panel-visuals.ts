export type PanelButtonKey =
    | "staff"
    | "map"
    | "city"
    | "points"
    | "options"
    | "help"
    | "build"
    | "exit";

export const PANEL_BUTTONS: ReadonlyArray<{
    key: PanelButtonKey;
    label: string;
    x: number;
    y: number;
    width: number;
    height: number;
}> = [
    { key: "staff", label: "Staff", x: 145, y: 268, width: 45, height: 20 },
    { key: "map", label: "Map", x: 145, y: 290, width: 45, height: 20 },
    { key: "city", label: "Info", x: 145, y: 312, width: 45, height: 20 },
    { key: "points", label: "Points", x: 145, y: 334, width: 45, height: 20 },
    { key: "options", label: "Options", x: 145, y: 356, width: 45, height: 20 },
    { key: "help", label: "Help", x: 145, y: 378, width: 45, height: 20 },
    { key: "build", label: "Build", x: 126, y: 400, width: 64, height: 22 },
    { key: "exit", label: "Exit", x: 150, y: 576, width: 42, height: 18 }
];

export type PanelVisualState = {
    panelView: "status" | "staff" | "city" | "points";
    showMapModal: boolean;
    showHelpModal: boolean;
    showOptionsModal: boolean;
    showBuildMenu: boolean;
    buildGhostMode: boolean;
    buildDemolishMode: boolean;
};

const PANEL_BUTTON_ACTIVE_BY_INDEX: ReadonlyArray<(state: PanelVisualState) => boolean> = [
    (state) => state.panelView === "staff",
    (state) => state.showMapModal,
    (state) => state.panelView === "city",
    (state) => state.panelView === "points",
    (state) => state.showOptionsModal,
    (state) => state.showHelpModal,
    (state) => state.showBuildMenu || state.buildGhostMode || state.buildDemolishMode
];

export const isPanelButtonActive = (
    state: PanelVisualState,
    index: number
): boolean => {
    const resolver = PANEL_BUTTON_ACTIVE_BY_INDEX[index];
    return typeof resolver === "function" ? resolver(state) : false;
};

export type RadarEntityKind = "self" | "ally" | "enemy" | "building";

export const resolveRadarColor = (kind: RadarEntityKind): number => {
    if (kind === "self") {
        return 0xffffff;
    }
    if (kind === "ally") {
        return 0x8ad4ff;
    }
    if (kind === "enemy") {
        return 0xffaa61;
    }
    return 0x56d27f;
};

export const PANEL_TOP_Y = 0;
export const PANEL_TOP_HEIGHT = 430;
export const PANEL_BOTTOM_Y = 430;
export const PANEL_BOTTOM_HEIGHT = 170;

export const PANEL_FINANCE = {
    moneyBox: { x: 2, y: 224 },
    incomeIcon: { x: 8, y: 225 },
    cashText: { x: 24, y: 226 }
} as const;

export const PANEL_HEALTH = {
    x: 137,
    y: 160,
    width: 38,
    height: 87
} as const;

export const PANEL_MESSAGE = {
    x: 12,
    y: 465,
    lineSpacing: 15
} as const;

export const RADAR_RANGE_PX = 2400;
export const RADAR_RATIO = 24;
export const RADAR_CENTER_OFFSET_X = 100;
export const RADAR_CENTER_Y = 80;
export const RADAR_OFFSET_ADJUST_X = 70;
export const RADAR_OFFSET_ADJUST_Y = 69;
export const RADAR_BOUNDS = {
    offsetX: 28,
    offsetY: 8,
    width: 138,
    height: 138
} as const;

export const PANEL_INVENTORY_SLOTS: ReadonlyArray<{ itemType: number; x: number; y: number }> = [
    { itemType: 12, x: 7, y: 267 }, // laser
    { itemType: 1, x: 42, y: 267 }, // rocket
    { itemType: 2, x: 77, y: 267 }, // medkit
    { itemType: 3, x: 7, y: 302 }, // bomb
    { itemType: 4, x: 42, y: 302 }, // mine
    { itemType: 5, x: 77, y: 302 }, // orb
    { itemType: 6, x: 7, y: 337 }, // flare
    { itemType: 7, x: 42, y: 337 }, // dfg
    { itemType: 8, x: 77, y: 337 }, // wall
    { itemType: 9, x: 7, y: 372 }, // turret
    { itemType: 10, x: 42, y: 372 }, // sleeper
    { itemType: 11, x: 77, y: 372 }, // plasma
    { itemType: 0, x: 7, y: 372 } // cloak (classic overlap)
];

export const HOME_ARROW = {
    x: 5,
    y: 160,
    frameWidth: 40,
    frameHeight: 40,
    frameCount: 8
} as const;

export const resolveHealthMaskRect = (
    health: number,
    maxHealth: number
): { x: number; y: number; width: number; height: number } => {
    const ratio = maxHealth <= 0 ? 0 : Math.max(0, Math.min(1, health / maxHealth));
    const visibleHeight = Math.floor(ratio * PANEL_HEALTH.height);
    return {
        x: PANEL_HEALTH.x,
        y: (PANEL_HEALTH.y + PANEL_HEALTH.height) - visibleHeight,
        width: PANEL_HEALTH.width,
        height: visibleHeight
    };
};

export const resolveHomeArrowFrame = (
    fromX: number,
    fromY: number,
    toX: number,
    toY: number
): number => {
    const dx = toX - fromX;
    const dy = toY - fromY;
    const angle = Math.atan2(-dy, dx);
    const bucket = Math.round(angle / (Math.PI / 4));
    return ((bucket % HOME_ARROW.frameCount) + HOME_ARROW.frameCount) % HOME_ARROW.frameCount;
};

export const projectRadarPoint = (
    panelStartX: number,
    myX: number,
    myY: number,
    targetX: number,
    targetY: number
): { x: number; y: number } | null => {
    const dx = targetX - myX;
    const dy = targetY - myY;
    const distance = Math.hypot(dx, dy);
    if (distance > RADAR_RANGE_PX) {
        return null;
    }

    const globalX = (panelStartX + RADAR_CENTER_OFFSET_X) + ((dx - RADAR_OFFSET_ADJUST_X) / RADAR_RATIO);
    const globalY = RADAR_CENTER_Y + ((dy - RADAR_OFFSET_ADJUST_Y) / RADAR_RATIO);

    const left = panelStartX + RADAR_BOUNDS.offsetX;
    const right = left + RADAR_BOUNDS.width;
    const top = RADAR_BOUNDS.offsetY;
    const bottom = top + RADAR_BOUNDS.height;

    if (globalX < left || globalX > right || globalY < top || globalY > bottom) {
        return null;
    }

    return {
        x: globalX - (panelStartX + RADAR_BOUNDS.offsetX),
        y: globalY - RADAR_BOUNDS.offsetY
    };
};
