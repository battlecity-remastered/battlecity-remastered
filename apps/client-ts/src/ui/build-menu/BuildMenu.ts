import type { ClientState } from "../../app/state.js";
import { createDirtyFlagTracker } from "../../render/dirty-flags.js";

type BuildTreeEntry = {
    key: string;
    type: number;
    label: string;
    menuIcon: number;
    parent: number;
    initial: 0 | 1 | 2 | 3;
};

type BuildMenuEntryState = "available" | "pending";

type ResolvedBuildMenuEntry = {
    hotkey: string;
    type: number;
    label: string;
    menuIcon: number;
    state: BuildMenuEntryState;
};

type BuildMenu = {
    render: () => void;
    dispose: () => void;
};

type BuildMenuAnchor = {
    anchorX?: number;
    anchorY?: number;
};

const CANT_BUILD = 0;
const CAN_BUILD = 1;
const HAS_BUILT = 2;
const RESEARCH_PENDING = 3;
const BUILDING_ICON_SPRITE_URL = "/assets/imgBuildIcons.png";
const BUILDING_ICON_FRAME_SIZE = 16;
const BUILDING_ICON_FRAME_COUNT = 14;
const BUILD_MENU_WIDTH = 180;
const BUILD_MENU_ROW_HEIGHT = 16;
const BUILD_MENU_EDGE_X = 16;
const BUILD_MENU_EDGE_Y = 16;

const HOTKEY_DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"] as const;

const BUILD_TREE: ReadonlyArray<BuildTreeEntry> = [
    { key: "CAN_BUILD_HOUSE", type: 300, label: "Housing", menuIcon: 0, parent: 0, initial: CAN_BUILD },
    { key: "CAN_BUILD_LASER_RESEARCH", type: 412, label: "Laser Research", menuIcon: 1, parent: 300, initial: CAN_BUILD },
    { key: "CAN_BUILD_LASER_FACTORY", type: 112, label: "Laser Factory", menuIcon: 1, parent: 412, initial: CANT_BUILD },
    { key: "CAN_BUILD_BAZOOKA_RESEARCH", type: 401, label: "Bazooka Research", menuIcon: 2, parent: 300, initial: CAN_BUILD },
    { key: "CAN_BUILD_BAZOOKA_FACTORY", type: 101, label: "Bazooka Factory", menuIcon: 2, parent: 401, initial: CANT_BUILD },
    { key: "CAN_BUILD_TURRET_RESEARCH", type: 409, label: "Turret Research", menuIcon: 9, parent: 300, initial: CAN_BUILD },
    { key: "CAN_BUILD_TURRET_FACTORY", type: 109, label: "Turret Factory", menuIcon: 9, parent: 409, initial: CANT_BUILD },
    { key: "CAN_BUILD_CLOAK_RESEARCH", type: 400, label: "Cloak Research", menuIcon: 1, parent: 401, initial: CANT_BUILD },
    { key: "CAN_BUILD_CLOAK_FACTORY", type: 100, label: "Cloak Factory", menuIcon: 1, parent: 400, initial: CANT_BUILD },
    { key: "CAN_BUILD_MEDKIT_RESEARCH", type: 402, label: "MedKit Research", menuIcon: 3, parent: 401, initial: CANT_BUILD },
    { key: "CAN_BUILD_MEDKIT_FACTORY", type: 102, label: "MedKit Factory", menuIcon: 3, parent: 402, initial: CANT_BUILD },
    { key: "CAN_BUILD_HOSPITAL", type: 200, label: "Hospital", menuIcon: 12, parent: 402, initial: CANT_BUILD },
    { key: "CAN_BUILD_PLASMA_RESEARCH", type: 411, label: "Plasma Turret Research", menuIcon: 10, parent: 409, initial: CANT_BUILD },
    { key: "CAN_BUILD_PLASMA_FACTORY", type: 111, label: "Plasma Turret Factory", menuIcon: 10, parent: 411, initial: CANT_BUILD },
    { key: "CAN_BUILD_MINE_RESEARCH", type: 404, label: "Mine Research", menuIcon: 5, parent: 409, initial: CANT_BUILD },
    { key: "CAN_BUILD_MINE_FACTORY", type: 104, label: "Mine Factory", menuIcon: 5, parent: 404, initial: CANT_BUILD },
    { key: "CAN_BUILD_ORB_RESEARCH", type: 405, label: "Orb Research", menuIcon: 6, parent: 400, initial: CANT_BUILD },
    { key: "CAN_BUILD_ORB_FACTORY", type: 105, label: "Orb Factory", menuIcon: 6, parent: 405, initial: CANT_BUILD },
    { key: "CAN_BUILD_BOMB_RESEARCH", type: 403, label: "Time Bomb Research", menuIcon: 4, parent: 400, initial: CANT_BUILD },
    { key: "CAN_BUILD_BOMB_FACTORY", type: 103, label: "Time Bomb Factory", menuIcon: 4, parent: 403, initial: CANT_BUILD },
    { key: "CAN_BUILD_SLEEPER_RESEARCH", type: 410, label: "Sleeper Research", menuIcon: 8, parent: 411, initial: CANT_BUILD },
    { key: "CAN_BUILD_SLEEPER_FACTORY", type: 110, label: "Sleeper Factory", menuIcon: 8, parent: 410, initial: CANT_BUILD },
    { key: "CAN_BUILD_WALL_RESEARCH", type: 413, label: "Wall Research", menuIcon: 11, parent: 411, initial: CANT_BUILD },
    { key: "CAN_BUILD_WALL_FACTORY", type: 108, label: "Wall Factory", menuIcon: 11, parent: 413, initial: CANT_BUILD },
    { key: "CAN_BUILD_DFG_RESEARCH", type: 407, label: "DFG Research", menuIcon: 8, parent: 404, initial: CANT_BUILD },
    { key: "CAN_BUILD_DFG_FACTORY", type: 107, label: "DFG Factory", menuIcon: 8, parent: 407, initial: CANT_BUILD },
    { key: "CAN_BUILD_FLARE_RESEARCH", type: 406, label: "Flare Gun Research", menuIcon: 1, parent: 405, initial: CANT_BUILD },
    { key: "CAN_BUILD_FLARE_FACTORY", type: 106, label: "Flare Gun Factory", menuIcon: 1, parent: 406, initial: CANT_BUILD }
];

const CHILDREN_BY_PARENT = BUILD_TREE.reduce<Map<number, BuildTreeEntry[]>>((acc, entry) => {
    const children = acc.get(entry.parent) ?? [];
    children.push(entry);
    acc.set(entry.parent, children);
    return acc;
}, new Map());

const ENTRY_BY_TYPE = BUILD_TREE.reduce<Map<number, BuildTreeEntry>>((acc, entry) => {
    acc.set(entry.type, entry);
    return acc;
}, new Map());

const toAnchorX = (state: ClientState, anchorX: number): number => {
    const width = state.pointer.surfaceWidth > 0
        ? state.pointer.surfaceWidth
        : (typeof window !== "undefined" ? window.innerWidth : 1024);
    return Math.max(BUILD_MENU_EDGE_X, Math.min(width - BUILD_MENU_EDGE_X, Math.round(anchorX)));
};

const toAnchorY = (state: ClientState, anchorY: number): number => {
    const height = state.pointer.surfaceHeight > 0
        ? state.pointer.surfaceHeight
        : (typeof window !== "undefined" ? window.innerHeight : 768);
    return Math.max(0, Math.min(height - BUILD_MENU_EDGE_Y, Math.round(anchorY)));
};

const setBuildMenuAnchor = (state: ClientState, anchor?: BuildMenuAnchor): void => {
    const fallbackX = Number.isFinite(state.pointer.x) ? state.pointer.x : state.ui.buildMenuAnchorX;
    const fallbackY = Number.isFinite(state.pointer.y) ? state.pointer.y : state.ui.buildMenuAnchorY;
    const requestedX = Number.isFinite(anchor?.anchorX) ? anchor?.anchorX : fallbackX;
    const requestedY = Number.isFinite(anchor?.anchorY) ? anchor?.anchorY : fallbackY;
    state.ui.buildMenuAnchorX = toAnchorX(state, requestedX);
    state.ui.buildMenuAnchorY = toAnchorY(state, requestedY);
};

const resolveBuildUnlockStates = (state: ClientState): Map<number, number> => {
    const unlockStates = BUILD_TREE.reduce<Map<number, number>>((acc, entry) => {
        acc.set(entry.type, entry.initial);
        return acc;
    }, new Map());

    for (const building of state.buildings.values()) {
        if (building.cityId !== state.local.city || building.type === 300) {
            continue;
        }
        if (ENTRY_BY_TYPE.has(building.type)) {
            unlockStates.set(building.type, HAS_BUILT);
        }
    }

    const queue: number[] = [];
    const queuedTypes = new Set<number>();
    for (const [type, unlockState] of unlockStates.entries()) {
        if (unlockState !== HAS_BUILT) {
            continue;
        }
        queue.push(type);
        queuedTypes.add(type);
    }

    while (queue.length > 0) {
        const parentType = queue.shift();
        if (parentType === undefined) {
            continue;
        }
        const children = CHILDREN_BY_PARENT.get(parentType);
        if (!children) {
            continue;
        }
        for (const child of children) {
            const current = unlockStates.get(child.type) ?? CANT_BUILD;
            if (current === HAS_BUILT) {
                if (!queuedTypes.has(child.type)) {
                    queue.push(child.type);
                    queuedTypes.add(child.type);
                }
                continue;
            }
            if (current === CANT_BUILD) {
                unlockStates.set(child.type, CAN_BUILD);
            }
        }
    }

    const research = state.research.get(state.local.city);
    const applyResearchState = (researchType: number, nextState: number): void => {
        const children = CHILDREN_BY_PARENT.get(researchType);
        if (!children) {
            return;
        }
        for (const child of children) {
            if (unlockStates.get(child.type) === HAS_BUILT) {
                continue;
            }
            unlockStates.set(child.type, nextState);
        }
    };

    if (research?.active) {
        applyResearchState(research.active.researchType, RESEARCH_PENDING);
    }
    for (const completedType of research?.completed ?? []) {
        applyResearchState(completedType, CAN_BUILD);
    }

    return unlockStates;
};

const resolveBuildMenuEntries = (state: ClientState): ResolvedBuildMenuEntry[] => {
    const unlockStates = resolveBuildUnlockStates(state);
    const visible = BUILD_TREE.filter((entry) => {
        const unlockState = unlockStates.get(entry.type) ?? CANT_BUILD;
        return unlockState === CAN_BUILD || unlockState === RESEARCH_PENDING;
    });

    return visible.map((entry, index) => {
        const unlockState = unlockStates.get(entry.type) ?? CANT_BUILD;
        return {
            hotkey: HOTKEY_DIGITS[index] ?? "",
            type: entry.type,
            label: entry.label,
            menuIcon: entry.menuIcon,
            state: unlockState === RESEARCH_PENDING ? "pending" : "available"
        };
    });
};

const resolveBuildTypeHotkeyForState = (state: ClientState, key: string): number | null => {
    const normalized = key.trim();
    if (!normalized) {
        return null;
    }
    const entry = resolveBuildMenuEntries(state).find((candidate) => candidate.hotkey === normalized);
    if (!entry || entry.state !== "available") {
        return null;
    }
    return entry.type;
};

export const isLocalMayor = (state: ClientState): boolean => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === state.local.city);
    return assignment?.mayorId === state.local.id;
};

export const canOpenBuildMenu = (state: ClientState): boolean => {
    return state.local.id !== null && isLocalMayor(state);
};

export const clearBuildInteractionModes = (state: ClientState): void => {
    state.ui.buildGhostMode = false;
    state.ui.buildDemolishMode = false;
    state.ui.pendingBuildPlacement = null;
    state.controls.build = false;
    state.controls.demolish = false;
    state.controls.ctrl = false;
};

export const activateGhostBuildMode = (state: ClientState, type: number): void => {
    state.ui.selectedBuildType = type;
    state.ui.showBuildMenu = false;
    state.ui.buildDemolishMode = false;
    state.ui.buildGhostMode = true;
};

export const activateDemolishMode = (state: ClientState): void => {
    state.ui.showBuildMenu = false;
    state.ui.buildGhostMode = false;
    state.ui.buildDemolishMode = true;
};

export const buildBuildMenuLines = (state: ClientState): string[] => {
    const isMayor = isLocalMayor(state);
    const resolvedEntries = resolveBuildMenuEntries(state);
    const lines = [
        "Build Menu",
        "Right click: open/cancel",
        `Role: ${isMayor ? "Mayor" : "Recruit"}`,
        `Mode: ${state.ui.buildGhostMode ? "Ghost Build" : state.ui.buildDemolishMode ? "Demolish" : "None"}`
    ];
    lines.push("0. Demolish building");
    for (const entry of resolvedEntries) {
        const selected = entry.type === state.ui.selectedBuildType && state.ui.buildGhostMode ? "*" : " ";
        const suffix = entry.state === "pending" ? " (researching)" : "";
        const hotkey = entry.hotkey.length > 0 ? `${entry.hotkey}. ` : "";
        lines.push(`${selected} ${hotkey}${entry.label}${suffix} (${entry.type})`);
    }
    return lines;
};

export const applyBuildMenuHotkey = (state: ClientState, key: string, anchor?: BuildMenuAnchor): boolean => {
    if (!canOpenBuildMenu(state)) {
        state.ui.showBuildMenu = false;
        clearBuildInteractionModes(state);
        return key === "F4";
    }

    if (key === "F4") {
        if (state.ui.showBuildMenu) {
            state.ui.showBuildMenu = false;
            return true;
        }
        clearBuildInteractionModes(state);
        setBuildMenuAnchor(state, anchor);
        state.ui.showBuildMenu = true;
        return true;
    }

    if (key === "0") {
        activateDemolishMode(state);
        return true;
    }

    const selected = resolveBuildTypeHotkeyForState(state, key);
    if (selected === null) {
        return false;
    }

    activateGhostBuildMode(state, selected);
    return true;
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

const createIcon = (iconIndex: number): HTMLSpanElement => {
    const icon = document.createElement("span");
    const clampedIndex = Math.max(0, Math.min(BUILDING_ICON_FRAME_COUNT - 1, Math.floor(iconIndex)));
    icon.style.display = "inline-block";
    icon.style.width = `${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.height = `${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.flex = `0 0 ${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.minWidth = `${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.minHeight = `${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.imageRendering = "pixelated";
    icon.style.backgroundImage = `url('${BUILDING_ICON_SPRITE_URL}')`;
    icon.style.backgroundRepeat = "no-repeat";
    icon.style.backgroundSize = `${BUILDING_ICON_FRAME_COUNT * BUILDING_ICON_FRAME_SIZE}px ${BUILDING_ICON_FRAME_SIZE}px`;
    icon.style.backgroundPosition = `${-clampedIndex * BUILDING_ICON_FRAME_SIZE}px 0px`;
    icon.style.pointerEvents = "none";
    return icon;
};

const createMenuRow = (
    label: string,
    iconIndex: number,
    enabled: boolean,
    selected: boolean,
    onClick: (() => void) | null
): HTMLButtonElement => {
    const row = document.createElement("button");
    row.type = "button";
    row.style.display = "flex";
    row.style.alignItems = "center";
    row.style.gap = "4px";
    row.style.width = "100%";
    row.style.height = `${BUILD_MENU_ROW_HEIGHT}px`;
    row.style.padding = "0";
    row.style.border = "0";
    row.style.appearance = "none";
    row.style.background = selected ? "rgba(80, 96, 140, 0.55)" : "transparent";
    row.style.color = enabled ? "#ffe66d" : "#857b46";
    row.style.font = "12px/16px monospace";
    row.style.textAlign = "left";
    row.style.whiteSpace = "nowrap";
    row.style.overflow = "hidden";
    row.style.textOverflow = "ellipsis";
    row.style.cursor = enabled ? "pointer" : "default";
    row.style.opacity = enabled ? "1" : "0.95";
    row.disabled = !enabled;

    row.appendChild(createIcon(iconIndex));

    const text = document.createElement("span");
    text.textContent = label;
    row.appendChild(text);

    if (enabled && onClick) {
        row.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });
    }

    return row;
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

    const panel = document.createElement("div");
    panel.setAttribute("data-ui", "build-menu");
    panel.style.position = "fixed";
    panel.style.left = "16px";
    panel.style.top = "16px";
    panel.style.width = `${BUILD_MENU_WIDTH}px`;
    panel.style.padding = "0";
    panel.style.margin = "0";
    panel.style.background = "rgba(0, 0, 0, 0.96)";
    panel.style.border = "1px solid rgba(130, 130, 130, 0.85)";
    panel.style.color = "#f2f2f2";
    panel.style.pointerEvents = "auto";
    panel.style.zIndex = "85";
    panel.style.boxShadow = "0 0 0 1px rgba(20, 20, 20, 0.8)";

    const list = document.createElement("div");
    panel.appendChild(list);
    root.appendChild(panel);

    const dirty = createDirtyFlagTracker();

    return {
        render: () => {
            const lobbyVisible = state.local.id === null;
            const canBuild = canOpenBuildMenu(state);
            if (!canBuild) {
                state.ui.showBuildMenu = false;
                clearBuildInteractionModes(state);
            }

            const visible = state.ui.showBuildMenu && !state.ui.showIntroModal && !lobbyVisible && canBuild;
            panel.style.display = visible ? "block" : "none";
            panel.style.opacity = String(state.ui.overlaysOpacity);

            if (!visible) {
                return;
            }

            const entries = resolveBuildMenuEntries(state);
            const lines = buildBuildMenuLines(state).join("|");
            const entriesSignature = entries
                .map((entry) => `${entry.hotkey}:${entry.type}:${entry.label}:${entry.menuIcon}:${entry.state}`)
                .join(";");
            const signature = `${state.ui.showBuildMenu}|${state.ui.buildGhostMode}|${state.ui.buildDemolishMode}|${state.ui.selectedBuildType}|${state.ui.buildMenuAnchorX},${state.ui.buildMenuAnchorY}|${entriesSignature}|${lines}`;

            if (!dirty.shouldRender("build-menu", signature)) {
                return;
            }

            list.replaceChildren();

            const demolishRow = createMenuRow(
                "Demolish building",
                13,
                true,
                state.ui.buildDemolishMode,
                () => {
                    activateDemolishMode(state);
                }
            );
            list.appendChild(demolishRow);

            for (const entry of entries) {
                const suffix = entry.state === "pending" ? " (researching)" : "";
                const enabled = entry.state === "available";
                const selected = enabled && state.ui.buildGhostMode && state.ui.selectedBuildType === entry.type;
                const row = createMenuRow(
                    `${entry.label}${suffix}`,
                    entry.menuIcon,
                    enabled,
                    selected,
                    enabled
                        ? () => {
                            activateGhostBuildMode(state, entry.type);
                        }
                        : null
                );
                list.appendChild(row);
            }

            const viewWidth = state.pointer.surfaceWidth > 0
                ? state.pointer.surfaceWidth
                : (typeof window !== "undefined" ? window.innerWidth : 1024);
            const viewHeight = state.pointer.surfaceHeight > 0
                ? state.pointer.surfaceHeight
                : (typeof window !== "undefined" ? window.innerHeight : 768);
            const menuHeight = Math.max(BUILD_MENU_ROW_HEIGHT, (entries.length + 1) * BUILD_MENU_ROW_HEIGHT);
            const left = Math.max(BUILD_MENU_EDGE_X, Math.min(viewWidth - BUILD_MENU_WIDTH - BUILD_MENU_EDGE_X, state.ui.buildMenuAnchorX));
            const bottom = Math.max(menuHeight, Math.min(viewHeight - BUILD_MENU_EDGE_Y, state.ui.buildMenuAnchorY));
            const top = Math.max(0, bottom - menuHeight);
            panel.style.height = `${menuHeight}px`;
            panel.style.left = `${left}px`;
            panel.style.top = `${top}px`;
        },
        dispose: () => {
            dirty.clear();
            panel.remove();
        }
    };
};
