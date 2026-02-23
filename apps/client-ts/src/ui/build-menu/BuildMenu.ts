import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

type BuildMenuEntry = {
    hotkey: string;
    type: number;
    label: string;
};

export const BUILD_MENU_ENTRIES: ReadonlyArray<BuildMenuEntry> = [
    { hotkey: "1", type: 109, label: "House" },
    { hotkey: "2", type: 300, label: "Hospital" },
    { hotkey: "3", type: 100, label: "Factory T1" },
    { hotkey: "4", type: 101, label: "Factory T2" },
    { hotkey: "5", type: 102, label: "Factory T3" }
];

export const resolveBuildTypeHotkey = (key: string): number | null => {
    const normalized = key.trim();
    const entry = BUILD_MENU_ENTRIES.find((candidate) => candidate.hotkey === normalized);
    return entry ? entry.type : null;
};

export const buildBuildMenuLines = (state: ClientState): string[] => {
    const lines = [
        "Build Menu",
        "F4: Toggle build menu",
        `Selected: ${state.ui.selectedBuildType}`,
        "Ctrl+B: Place selected type at pointer"
    ];
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
    panel.style.padding = "10px";
    panel.style.margin = "0";
    panel.style.background = "rgba(10, 16, 14, 0.72)";
    panel.style.border = "1px solid rgba(140, 224, 196, 0.62)";
    panel.style.color = "#d4f7e8";
    panel.style.font = "12px/1.4 monospace";
    panel.style.pointerEvents = "none";
    panel.style.zIndex = "70";
    root.appendChild(panel);
    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            panel.style.display = state.ui.showBuildMenu ? "block" : "none";
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
