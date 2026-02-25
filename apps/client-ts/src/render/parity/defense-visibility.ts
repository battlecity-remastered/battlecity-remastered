import type { ClientState } from "../../app/state.js";
import { TILE, ITEM_TYPE_SLEEPER } from "./constants.js";

const SLEEPER_REVEAL_RANGE_PX = 400;
const HALF_TILE = TILE / 2;
const SLEEPER_REVEAL_RANGE_SQUARED = SLEEPER_REVEAL_RANGE_PX * SLEEPER_REVEAL_RANGE_PX;

type DefenseRenderState = {
    id: string;
    cityId: number;
    type: number;
    tileX: number;
    tileY: number;
};

const resolveCenter = (tileX: number, tileY: number): { x: number; y: number; } => {
    return {
        x: (tileX * TILE) + HALF_TILE,
        y: (tileY * TILE) + HALF_TILE
    };
};

export const isDefenseVisibleToLocalPlayer = (
    state: ClientState,
    defense: DefenseRenderState
): boolean => {
    if (defense.type !== ITEM_TYPE_SLEEPER) {
        return true;
    }
    if (defense.cityId === state.local.city) {
        return true;
    }
    const localX = state.local.x + HALF_TILE;
    const localY = state.local.y + HALF_TILE;
    const center = resolveCenter(defense.tileX, defense.tileY);
    const dx = center.x - localX;
    const dy = center.y - localY;
    return ((dx * dx) + (dy * dy)) <= SLEEPER_REVEAL_RANGE_SQUARED;
};

export const resolveVisibleDefenseIds = (state: ClientState): string[] => {
    const ids: string[] = [];
    for (const defense of state.defenses.values()) {
        if (isDefenseVisibleToLocalPlayer(state, defense)) {
            ids.push(defense.id);
        }
    }
    return ids;
};
