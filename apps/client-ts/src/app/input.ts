import type { ClientState } from "./state.js";

const asLower = (value: string): string => value.toLowerCase();

type ControlKey = keyof ClientState["controls"];

const KEY_TO_CONTROL: Record<string, ControlKey> = {
    w: "moveForward",
    arrowup: "moveForward",
    s: "moveForward",
    arrowdown: "moveForward",
    a: "turnLeft",
    arrowleft: "turnLeft",
    d: "turnRight",
    arrowright: "turnRight",
    e: "turnRight",
    " ": "shoot",
    space: "shoot",
    spacebar: "shoot",
    shift: "shift",
    control: "ctrl",
    b: "build",
    o: "build",
    x: "demolish",
    delete: "demolish",
    u: "useItem",
    h: "useItem",
    l: "leaveLobby",
    r: "research",
    c: "collectFactory"
};

const setControlFromKey = (state: ClientState, key: string, value: boolean): void => {
    const control = KEY_TO_CONTROL[asLower(key)];
    if (!control) {
        return;
    }
    state.controls[control] = value;
};

export const registerInputHandlers = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        setControlFromKey(state, event.key, true);
    };

    const onKeyUp = (event: KeyboardEvent): void => {
        setControlFromKey(state, event.key, false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
        window.removeEventListener("keydown", onKeyDown);
        window.removeEventListener("keyup", onKeyUp);
    };
};
