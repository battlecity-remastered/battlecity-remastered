import type { ClientState } from "../app/state.js";

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
};

type PointerPosition = {
    x: number;
    y: number;
    inside: boolean;
    width: number;
    height: number;
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

    const onMouseDown = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        const control = resolveControlForMouseButton(pointerEvent.button);
        if (!control) {
            return;
        }
        state.controls[control] = true;
    };

    const onMouseUp = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        const control = resolveControlForMouseButton(pointerEvent.button);
        if (!control) {
            return;
        }
        state.controls[control] = false;
    };

    const onMouseMove = (event: Event): void => {
        const pointerEvent = event as MouseEvent;
        applyPointerUpdate(state, surface, pointerEvent.clientX, pointerEvent.clientY);
    };

    const onMouseLeave = (): void => {
        state.pointer.inside = false;
        clearPointerControls(state);
    };

    const onContextMenu = (event: Event): void => {
        event.preventDefault();
    };

    const onWindowResize = (): void => {
        syncSurfaceMetrics(state, surface);
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
    };
};
