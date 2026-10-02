// Original BattleCity tile-based bomb rules, shared by server and demo.
export const LEGACY_BOMB_FUSE_MS = 5000;
export const LEGACY_BOMB_DAMAGE = 25;
export const LEGACY_BOMB_PLAYER_TILE_RADIUS = 1;
export const LEGACY_BOMB_STRUCTURE_TILE_RADIUS = 1;
export const isBombStructureInRange = (tileX:number,tileY:number,centerX:number,centerY:number,footprint=1):boolean => {
    const x=Math.max(tileX,Math.min(centerX,tileX+footprint-1));
    const y=Math.max(tileY,Math.min(centerY,tileY+footprint-1));
    return Math.abs(x-centerX)<=LEGACY_BOMB_STRUCTURE_TILE_RADIUS && Math.abs(y-centerY)<=LEGACY_BOMB_STRUCTURE_TILE_RADIUS;
};
