import { tileToRect, type BlockingRect } from "@battlecity/sim-core";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;

export const collectBlockingRects = (state: ClientState): BlockingRect[] => {
    const blocks: BlockingRect[] = [];
    for (const building of state.buildings.values()) {
        blocks.push(tileToRect(building.tileX, building.tileY, TILE_SIZE));
    }
    for (const defense of state.defenses.values()) {
        blocks.push(tileToRect(defense.tileX, defense.tileY, TILE_SIZE));
    }
    return blocks;
};
