import type { ClientState } from "./state.js";
import { isInteractiveKeyboardTarget } from "../input/interactive-target.js";

const asLower = (value: string): string => value.toLowerCase();

type ControlKey = keyof ClientState["controls"];

const KEY_TO_CONTROL: Record<string, ControlKey> = {
    w: "moveForward",
    keyw: "moveForward",
    arrowup: "moveForward",
    up: "moveForward",
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
    x: "demolish",
    delete: "demolish",
    u: "collectFactory",
    h: "useItem",
    l: "leaveLobby",
    r: "research",
    c: "useCloak"
};

const isShiftEvent = (event: KeyboardEvent): boolean => {
    const key = asLower(event.key);
    if (key === "shift") {
        return true;
    }
    const code = asLower(event.code);
    return code === "shiftleft" || code === "shiftright";
};

const isControlEvent = (event: KeyboardEvent): boolean => {
    const key = asLower(event.key);
    if (key === "control") {
        return true;
    }
    const code = asLower(event.code);
    return code === "controlleft" || code === "controlright";
};

const outputBuildings = (state: ClientState): void => {
    console.log("Generating building output");
    for (const building of state.buildings.values()) {
        if (building.type === 0) {
            continue;
        }
        console.log(`${building.type},${building.tileX},${building.tileY}`);
    }
};

const setControlFromEvent = (state: ClientState, event: KeyboardEvent, value: boolean): void => {
    if (isShiftEvent(event)) {
        state.controls.shift = value;
        state.controls.shoot = value;
        return;
    }
    if (isControlEvent(event)) {
        state.controls.ctrl = value;
        if (value && !event.repeat) {
            state.local.pendingFlareBurst = true;
        }
        return;
    }
    const code = asLower(event.code);
    const key = asLower(event.key);
    if ((code === "keys" || key === "s") && value) {
        outputBuildings(state);
        return;
    }
    if (code === "keyb" || key === "b") {
        // Classic parity: plain B is bomb shortcut; keep Ctrl+B as a build modifier.
        if (!value) {
            state.controls.build = false;
            return;
        }
        if (event.ctrlKey) {
            state.controls.build = true;
        }
        return;
    }
    const fromCode = KEY_TO_CONTROL[code];
    const fromKey = KEY_TO_CONTROL[key];
    const control = fromCode ?? fromKey;
    if (!control) {
        return;
    }
    state.controls[control] = value;
};

export const registerInputHandlers = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        if (isInteractiveKeyboardTarget(event)) {
            return;
        }
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
