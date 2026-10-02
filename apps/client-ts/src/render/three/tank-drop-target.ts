import type { ClientState } from "../../app/state.js";
import { resolveHazardDropPlacement } from "../../gameplay/items/drop-placement.js";

// Preserve the original 32px padded tank footprint, greatest tile overlap and
// centre-tile tie break. An occupied target fails; it never searches neighbours.
export const resolveTankDropTarget=(state:ClientState,occupied:ReadonlySet<string>=new Set())=>{
    const placement=resolveHazardDropPlacement(state);
    return placement && !occupied.has(`${placement.tileX},${placement.tileY}`)?placement:null;
};
