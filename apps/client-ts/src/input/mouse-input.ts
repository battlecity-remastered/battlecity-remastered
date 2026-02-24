import type { ClientState } from "../app/state.js";
import { PANEL_WIDTH } from "../gameplay/world-viewport.js";
import { PANEL_BUTTONS, type PanelButtonKey } from "../render/panel/panel-visuals.js";

type Listener = (event: Event) => void;

type EventSource = {
    addEventListener: (type: string, listener: Listener) => void;
    removeEventListener: (type: string, listener: Listener) => void;
};

type PointerSurface = EventSource & {
    getBoundingClientRect: () => {
        left: number;
        top: number;
        width: number;
        height: number;
    };
    style?: {
        cursor?: string;
    };
};

type PointerPosition = {
    x: number;
    y: number;
    inside: boolean;
    width: number;
    height: number;
};

export type PanelAction =
    | "toggle_staff"
    | "toggle_city_info"
    | "toggle_points"
    | "toggle_map"
    | "toggle_help"
    | "toggle_options"
    | "toggle_build"
    | "leave_lobby";

const panelActionFromButtonKey = (key: PanelButtonKey): PanelAction => {
    if (key === "staff") {
        return "toggle_staff";
    }
    if (key === "city") {
        return "toggle_city_info";
    }
    if (key === "points") {
        return "toggle_points";
    }
    if (key === "map") {
        return "toggle_map";
    }
    if (key === "help") {
        return "toggle_help";
    }
    if (key === "options") {
        return "toggle_options";
    }
    if (key === "build") {
        return "toggle_build";
    }
    return "leave_lobby";
};

export const resolveCursorForState = (state: ClientState): string => {
    if (state.controls.demolish) {
        return "not-allowed";
    }
    if (state.ui.showBuildMenu) {
        return "crosshair";
    }
    if (state.ui.bombArmed) {
        return "cell";
    }
    return "default";
};

export const resolvePanelAction = (
    pointerX: number,
    pointerY: number,
    surfaceWidth: number
): PanelAction | null => {
    if (!Number.isFinite(pointerX) || !Number.isFinite(pointerY) || !Number.isFinite(surfaceWidth)) {
        return null;
    }
    const panelStart = surfaceWidth - PANEL_WIDTH;
    if (pointerX < panelStart) {
        return null;
    }
    const panelX = pointerX - panelStart;
    for (const button of PANEL_BUTTONS) {
        const insideX = panelX >= button.x && panelX <= (button.x + button.width);
        const insideY = pointerY >= button.y && pointerY <= (button.y + button.height);
        if (insideX && insideY) {
            return panelActionFromButtonKey(button.key);
        }
    }
    return null;
};

const togglePanelView = (
    state: ClientState,
    view: "staff" | "city" | "points"
): void => {
    state.ui.panelView = state.ui.panelView === view ? "status" : view;
    state.ui.showMapModal = false;
    state.ui.showHelpModal = false;
    state.ui.showOptionsModal = false;
};

const applyPanelAction = (state: ClientState, action: PanelAction): void => {
    if (action === "toggle_staff") {
        togglePanelView(state, "staff");
        return;
    }
    if (action === "toggle_city_info") {
        togglePanelView(state, "city");
        return;
    }
    if (action === "toggle_points") {
        togglePanelView(state, "points");
        return;
    }
    if (action === "toggle_map") {
        state.ui.showMapModal = !state.ui.showMapModal;
        state.ui.panelView = "status";
        state.ui.showHelpModal = false;
        state.ui.showOptionsModal = false;
        return;
    }
    if (action === "toggle_help") {
        state.ui.showHelpModal = !state.ui.showHelpModal;
        state.ui.panelView = "status";
        state.ui.showMapModal = false;
        state.ui.showOptionsModal = false;
        return;
    }
    if (action === "toggle_options") {
        state.ui.showOptionsModal = !state.ui.showOptionsModal;
        state.ui.panelView = "status";
        state.ui.showHelpModal = false;
        state.ui.showMapModal = false;
        return;
    }
    if (action === "toggle_build") {
        state.ui.showBuildMenu = !state.ui.showBuildMenu;
        return;
    }
    state.controls.leaveLobby = true;
    if (typeof window !== "undefined" && typeof window.setTimeout === "function") {
        window.setTimeout(() => {
            state.controls.leaveLobby = false;
        }, 0);
    }
};

export const resolveControlForMouseButton = (
    button: number
): keyof ClientState["controls"] | null => {
    if (button === 0) {
        return "shoot";
    }
    if (button === 2) {
        return "useItem";
    }
    return null;
};

export const resolvePointerPosition = (
    clientX: number,
    clientY: number,
    rect: { left: number; top: number; width: number; height: number; }
): PointerPosition => {
    const width = Math.max(0, rect.width);
    const height = Math.max(0, rect.height);
    if (width === 0 || height === 0) {
        return {
            x: 0,
            y: 0,
            inside: false,
            width,
            height
        };
    }

    const rawX = clientX - rect.left;
    const rawY = clientY - rect.top;
    const clampedX = Math.min(Math.max(rawX, 0), width);
    const clampedY = Math.min(Math.max(rawY, 0), height);

    return {
        x: clampedX,
        y: clampedY,
        inside: rawX >= 0 && rawX <= width && rawY >= 0 && rawY <= height,
        width,
        height
    };
};

const syncSurfaceMetrics = (state: ClientState, surface: PointerSurface): void => {
    const rect = surface.getBoundingClientRect();
    state.pointer.surfaceWidth = Math.max(0, rect.width);
    state.pointer.surfaceHeight = Math.max(0, rect.height);
};

const applyPointerUpdate = (state: ClientState, surface: PointerSurface, clientX: number, clientY: number): void => {
    const resolved = resolvePointerPosition(clientX, clientY, surface.getBoundingClientRect());
    state.pointer.x = resolved.x;
    state.pointer.y = resolved.y;
    state.pointer.inside = resolved.inside;
    state.pointer.surfaceWidth = resolved.width;
    state.pointer.surfaceHeight = resolved.height;
};

const syncCursor = (state: ClientState, surface: PointerSurface): void => {
    if (!surface.style) {
        return;
    }
    const cursor = resolveCursorForState(state);
    if (surface.style.cursor !== cursor) {
        surface.style.cursor = cursor;
    }
};

const clearPointerControls = (state: ClientState): void => {
    state.controls.shoot = false;
    state.controls.useItem = false;
};

export const registerMouseInputHandlers = (
    state: ClientState,
    surface: PointerSurface,
    windowSource: EventSource | null = typeof window === "undefined" ? null : window
): (() => void) => {
    syncSurfaceMetrics(state, surface);
    syncCursor(state, surface);

    const onMouseDown = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        if (Number.isFinite(pointerEvent.clientX) && Number.isFinite(pointerEvent.clientY)) {
            applyPointerUpdate(state, surface, pointerEvent.clientX, pointerEvent.clientY);
        }
        const panelAction = pointerEvent.button === 0
            ? resolvePanelAction(state.pointer.x, state.pointer.y, state.pointer.surfaceWidth)
            : null;
        if (panelAction) {
            applyPanelAction(state, panelAction);
            syncCursor(state, surface);
            return;
        }
        if (pointerEvent.button === 0 && state.ui.showBuildMenu) {
            state.controls.build = true;
            state.controls.ctrl = true;
            state.controls.shoot = false;
            syncCursor(state, surface);
            return;
        }
        const control = resolveControlForMouseButton(pointerEvent.button);
        if (!control) {
            return;
        }
        state.controls[control] = true;
        syncCursor(state, surface);
    };

    const onMouseUp = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        if (pointerEvent.button === 0 && state.ui.showBuildMenu) {
            state.controls.build = false;
            state.controls.ctrl = false;
            syncCursor(state, surface);
            return;
        }
        const control = resolveControlForMouseButton(pointerEvent.button);
        if (!control) {
            return;
        }
        state.controls[control] = false;
        syncCursor(state, surface);
    };

    const onMouseMove = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        applyPointerUpdate(state, surface, pointerEvent.clientX, pointerEvent.clientY);
        syncCursor(state, surface);
    };

    const onMouseLeave = (): void => {
        state.pointer.inside = false;
        clearPointerControls(state);
        syncCursor(state, surface);
    };

    const onContextMenu = (event: Event): void => {
        event.preventDefault();
    };

    const onWindowResize = (): void => {
        syncSurfaceMetrics(state, surface);
        syncCursor(state, surface);
    };

    surface.addEventListener("mousedown", onMouseDown);
    surface.addEventListener("mouseup", onMouseUp);
    surface.addEventListener("mousemove", onMouseMove);
    surface.addEventListener("mouseleave", onMouseLeave);
    surface.addEventListener("contextmenu", onContextMenu);

    if (windowSource) {
        windowSource.addEventListener("resize", onWindowResize);
    }

    return () => {
        surface.removeEventListener("mousedown", onMouseDown);
        surface.removeEventListener("mouseup", onMouseUp);
        surface.removeEventListener("mousemove", onMouseMove);
        surface.removeEventListener("mouseleave", onMouseLeave);
        surface.removeEventListener("contextmenu", onContextMenu);
        if (windowSource) {
            windowSource.removeEventListener("resize", onWindowResize);
        }
        if (surface.style) {
            surface.style.cursor = "default";
        }
    };
};
