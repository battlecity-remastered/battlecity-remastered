import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

type BuildMenuEntry = {
    hotkey: string;
    type: number;
    label: string;
};

export const BUILD_MENU_ENTRIES: ReadonlyArray<BuildMenuEntry> = [
    { hotkey: "1", type: 300, label: "Housing" },
    { hotkey: "2", type: 412, label: "Laser Research" },
    { hotkey: "3", type: 401, label: "Bazooka Research" },
    { hotkey: "4", type: 409, label: "Turret Research" },
    { hotkey: "5", type: 200, label: "Hospital" }
];

export const resolveBuildTypeHotkey = (key: string): number | null => {
    const normalized = key.trim();
    const entry = BUILD_MENU_ENTRIES.find((candidate) => candidate.hotkey === normalized);
    return entry ? entry.type : null;
};

export const buildBuildMenuLines = (state: ClientState): string[] => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === state.local.city);
    const isMayor = assignment?.mayorId === state.local.id;
    const lines = [
        "Build Menu",
        "F4: Toggle build menu",
        `Selected: ${state.ui.selectedBuildType}`,
        `Role: ${isMayor ? "Mayor" : "Recruit"} (${isMayor ? "build enabled" : "build denied"})`,
        "Left click map while menu open: place selected type",
        "Ctrl+B: Place selected type at pointer"
    ];
    if (state.events.lastBuildDeniedReason) {
        lines.push(`Last deny: ${state.events.lastBuildDeniedReason}`);
    }
    for (const entry of BUILD_MENU_ENTRIES) {
        const selected = entry.type === state.ui.selectedBuildType ? "*" : " ";
        lines.push(`${selected} ${entry.hotkey}. ${entry.label} (${entry.type})`);
    }
    return lines;
};

export const applyBuildMenuHotkey = (state: ClientState, key: string): boolean => {
    if (key === "F4") {
        state.ui.showBuildMenu = !state.ui.showBuildMenu;
        return true;
    }

    const selected = resolveBuildTypeHotkey(key);
    if (selected === null) {
        return false;
    }

    state.ui.selectedBuildType = selected;
    state.ui.showBuildMenu = true;
    return true;
};

type BuildMenu = {
    render: () => void;
    dispose: () => void;
};

export const registerBuildMenuHotkeys = (state: ClientState): (() => void) => {
    const onKeyDown = (event: KeyboardEvent): void => {
        const handled = applyBuildMenuHotkey(state, event.key);
        if (handled) {
            event.preventDefault();
        }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
        window.removeEventListener("keydown", onKeyDown);
    };
};

export const createBuildMenu = (
    state: ClientState,
    root: HTMLElement | null = typeof document === "undefined" ? null : document.body
): BuildMenu => {
    if (!root || typeof document === "undefined") {
        return {
            render: () => {},
            dispose: () => {}
        };
    }

    const panel = document.createElement("pre");
    panel.setAttribute("data-ui", "build-menu");
    panel.style.position = "fixed";
    panel.style.top = "12px";
    panel.style.left = "12px";
    panel.style.padding = "10px 12px";
    panel.style.margin = "0";
    panel.style.background = "rgba(19, 29, 23, 0.74)";
    panel.style.border = "1px solid rgba(166, 200, 143, 0.8)";
    panel.style.color = "#dbf0c7";
    panel.style.font = "12px/1.4 monospace";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "70";
    panel.style.boxShadow = "0 8px 22px rgba(0, 0, 0, 0.35)";
    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showBuildMenu && !state.ui.showIntroModal ? "block" : "none";
            panel.style.opacity = String(state.ui.overlaysOpacity);
            const text = buildBuildMenuLines(state).join("\n");
            const signature = `${panel.style.display}|${panel.style.opacity}|${text}`;
            if (dirty.shouldRender("build-menu", signature)) {
                panel.textContent = text;
            }
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
