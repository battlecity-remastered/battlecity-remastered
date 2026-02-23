import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;

export type GhostPlacement = {
    tileX: number;
    tileY: number;
    blocked: boolean;
    buildType: number;
};

export const isGhostTileBlocked = (
    state: ClientState,
    tileX: number,
    tileY: number
): boolean => {
    for (const building of state.buildings.values()) {
        if (building.tileX === tileX && building.tileY === tileY) {
            return true;
        }
    }
    for (const defense of state.defenses.values()) {
        if (defense.tileX === tileX && defense.tileY === tileY) {
            return true;
        }
    }
    return false;
};

export const resolveGhostPlacement = (state: ClientState): GhostPlacement | null => {
    if (!state.ui.showBuildMenu || !state.pointer.inside) {
        return null;
    }
    if (!state.controls.ctrl || !state.controls.build || state.controls.shift) {
        return null;
    }

    const tileX = Math.floor(state.pointer.x / TILE_SIZE);
    const tileY = Math.floor(state.pointer.y / TILE_SIZE);
    return {
        tileX,
        tileY,
        blocked: isGhostTileBlocked(state, tileX, tileY),
        buildType: state.ui.selectedBuildType
    };
};
