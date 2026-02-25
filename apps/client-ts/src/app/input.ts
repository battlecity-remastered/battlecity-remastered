import type { ClientState } from "./state.js";

const asLower = (value: string): string => value.toLowerCase();

type ControlKey = keyof ClientState["controls"];

const KEY_TO_CONTROL: Record<string, ControlKey> = {
    w: "moveForward",
    keyw: "moveForward",
    arrowup: "moveForward",
    up: "moveForward",
    s: "moveBackward",
    keys: "moveBackward",
    arrowdown: "moveBackward",
    down: "moveBackward",
    a: "turnLeft",
    keya: "turnLeft",
    arrowleft: "turnLeft",
    left: "turnLeft",
    arrowright: "turnRight",
    right: "turnRight",
    " ": "shoot",
    space: "shoot",
    spacebar: "shoot",
    shiftleft: "shift",
    shiftright: "shift",
    shift: "shift",
    control: "ctrl",
    b: "build",
    o: "build",
    x: "demolish",
    delete: "demolish",
    u: "collectFactory",
    h: "useItem",
    l: "leaveLobby",
    r: "research",
    c: "useItem"
};

const isShiftEvent = (event: KeyboardEvent): boolean => {
    const key = asLower(event.key);
    if (key === "shift") {
        return true;
    }
    const code = asLower(event.code);
    return code === "shiftleft" || code === "shiftright";
};

const setControlFromEvent = (state: ClientState, event: KeyboardEvent, value: boolean): void => {
    if (isShiftEvent(event)) {
        state.controls.shift = value;
        state.controls.shoot = value;
        return;
    }
    const fromCode = KEY_TO_CONTROL[asLower(event.code)];
    const fromKey = KEY_TO_CONTROL[asLower(event.key)];
    const control = fromCode ?? fromKey;
    if (!control) {
        return;
    }
    state.controls[control] = value;
};

export const registerInputHandlers = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        setControlFromEvent(state, event, true);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
        setControlFromEvent(state, event, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
    };
};
