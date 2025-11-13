import {COLLISION_BLOCKING} from "../constants.js";
import {COLLISION_MAP_EDGE_LEFT} from "../constants.js";
import {COLLISION_MAP_EDGE_RIGHT} from "../constants.js";
import {COLLISION_MAP_EDGE_TOP} from "../constants.js";
import {COLLISION_MAP_EDGE_BOTTOM} from "../constants.js";
import {COLLISION_MINE} from "../constants.js";
import {COLLISION_DFG} from "../constants.js";
import {ITEM_TYPE_MINE} from "../constants.js";
import {ITEM_TYPE_DFG} from "../constants.js";
import {ITEM_TYPE_ORB} from "../constants.js";

export const rectangleCollision = (rect1, rect2) => {
    if (!rect1 || !rect2) {
        return false;
    }

    const rect1Left = rect1.x;
    const rect1Top = rect1.y;
    const rect1Right = rect1Left + rect1.w;
    const rect1Bottom = rect1Top + rect1.h;

    const rect2Left = rect2.x;
    const rect2Top = rect2.y;
    const rect2Right = rect2Left + rect2.w;
    const rect2Bottom = rect2Top + rect2.h;

    if (rect1Right <= rect2Left) {
        return false;
    }
    if (rect2Right <= rect1Left) {
        return false;
    }

    if (rect1Bottom <= rect2Top) {
        return false;
    }

    if (rect2Bottom <= rect1Top) {
        return false;
    }

    return true;
};

export const checkEdges = (rect) => {
    if (rect.x < 0) return COLLISION_MAP_EDGE_LEFT;
    if (rect.x > (510 * 48)) return COLLISION_MAP_EDGE_RIGHT;
    if (rect.y < 0) return COLLISION_MAP_EDGE_TOP;
    if (rect.y > (510 * 48)) return COLLISION_MAP_EDGE_BOTTOM;

    return false;
};


export const checkItems = (game, rect) => {
    var item = game.itemFactory.getHead();
    const playerTeam = game.player?.city ?? null;

    while (item) {

        var itemRect = {
            x: item.x,
            y: item.y,
            w: 48,
            h: 48,
        };

        if (rectangleCollision(rect, itemRect)) {
            if (item.type === ITEM_TYPE_MINE && item.active !== false) {
                const mineTeam = item.teamId ?? null;
                if (mineTeam === null || mineTeam !== playerTeam) {
                    game.player.collidedItem = item;
                    return COLLISION_MINE;
                }
                // Friendly mines are intangible to the owner and teammates.
            } else if (item.type === ITEM_TYPE_DFG && item.active !== false) {
                const dfgTeam = item.teamId ?? item.city ?? null;
                if (dfgTeam === null || dfgTeam !== playerTeam) {
                    game.player.collidedItem = item;
                    return COLLISION_DFG;
                }
            } else if (item.type === ITEM_TYPE_ORB) {
                // Orbs should not block movement so players can recover them or finish a drop.
                // Keep collidedItem handy for any contextual logic that needs to know about overlap.
                game.player.collidedItem = item;
            } else if (item.active !== false && item.type !== ITEM_TYPE_DFG) {
                return COLLISION_BLOCKING;
            }
        }

        item = item.next;
    }

    return false;
};

export const checkTiles = (game, rect) => {

    var map = game["map"];

    var left = Math.floor((rect.x) / 48);
    var right = Math.floor((rect.x + rect.w) / 48);
    var top = Math.floor((rect.y) / 48);
    var bottom = Math.floor((rect.y + rect.h) / 48);

    /*
     console.log("left, top ", left + "," + top );
     console.log("right, top ", right + "," + top );


     console.log("left, bottom ", left + "," + bottom );
     console.log("right, bottm ", right + "," + bottom );

     console.log(map[left][top]);
     console.log(map[right][top]);
     console.log(map[left][bottom]);
     console.log(map[right][bottom]);
     */

    if (left && right && top && bottom) {
        //Map Terrain (lava, rocks)
        try {
            if (map[left][top] != 0 && map[left][top] != 3) return COLLISION_BLOCKING;
            if (map[left][bottom] != 0 && map[left][bottom] != 3) return COLLISION_BLOCKING;
            if (map[right][top] != 0 && map[right][top] != 3) return COLLISION_BLOCKING;
            if (map[right][bottom] != 0 && map[right][bottom] != 3) return COLLISION_BLOCKING;
        }catch (_ex) {
            console.error("Invalid map reference")
        }
    }

    return false;
};

export const getPlayerRect = (player) => {


    // Gap is because tank image doesn't take up full tile
    var gap = 8;

    return {
        x: parseInt(player.offset.x + gap),
        y: parseInt(player.offset.y + gap),
        w: 48 - gap - gap,
        h: 48 - gap - gap
    };

};
