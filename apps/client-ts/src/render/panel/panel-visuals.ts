export const PANEL_BUTTON_START_X = 112;
export const PANEL_BUTTON_WIDTH = 82;
export const PANEL_BUTTON_HEIGHT = 22;
export const PANEL_BUTTON_START_Y = 72;
export const PANEL_BUTTON_STEP = 28;
export const PANEL_BUTTON_LABELS = [
    "Staff",
    "City",
    "Points",
    "Map",
    "Help",
    "Options",
    "Build",
    "Exit"
] as const;

export type PanelVisualState = {
    panelView: "status" | "staff" | "city" | "points";
    showMapModal: boolean;
    showHelpModal: boolean;
    showOptionsModal: boolean;
    showBuildMenu: boolean;
};

export const isPanelButtonActive = (
    state: PanelVisualState,
    index: number
): boolean => {
    return (
        (index === 0 && state.panelView === "staff")
        || (index === 1 && state.panelView === "city")
        || (index === 2 && state.panelView === "points")
        || (index === 3 && state.showMapModal)
        || (index === 4 && state.showHelpModal)
        || (index === 5 && state.showOptionsModal)
        || (index === 6 && state.showBuildMenu)
    );
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
