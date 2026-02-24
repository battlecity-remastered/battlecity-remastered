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
};

export const isPanelButtonActive = (
    state: PanelVisualState,
    index: number
): boolean => {
    return (
        (index === 0 && state.panelView === "staff")
        || (index === 1 && state.showMapModal)
        || (index === 2 && state.panelView === "city")
        || (index === 3 && state.panelView === "points")
        || (index === 4 && state.showOptionsModal)
        || (index === 5 && state.showHelpModal)
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
