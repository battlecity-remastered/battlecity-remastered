import PIXI from '../pixi';

import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {ITEM_TYPE_DFG} from "../constants";
import {ITEM_TYPE_ORB} from "../constants";
import { getOrbAnimationFrame } from '../utils/orbAnimation';

var drawTick = 0;
const textureCache = new Map();

const getItemTexture = (baseTexture, cacheKey, x, y, width, height) => {
    if (!baseTexture) {
        return null;
    }
    const baseId = baseTexture.uid || baseTexture.cacheId || 'base';
    const key = `${baseId}:${cacheKey}:${x}:${y}:${width}:${height}`;
    let cached = textureCache.get(key);
    if (!cached) {
        cached = new PIXI.Texture(
            baseTexture,
            new PIXI.Rectangle(x, y, width, height)
        );
        textureCache.set(key, cached);
    }
    return cached;
};

var getItemsWithingRange = function (itemFactory, player) {

    var item = itemFactory.getHead();
    var range = 40 * 48;
    var foundItems = [];
    while (item) {

        if (item.x > (player.offset.x - range)
            && item.x < (player.offset.x + range)
            && item.y > (player.offset.y - range)
            && item.y < (player.offset.y + range)
        ) {
            foundItems.push(item)
        }
        item = item.next;
    }

    return foundItems
};

var drawTurret = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageTurretBase']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const typeIndex = Math.max(0, Math.min(2, (item.type ?? ITEM_TYPE_TURRET) - ITEM_TYPE_TURRET));
    const maxLife = Number.isFinite(item?.maxLife) ? item.maxLife : null;
    const currentLife = Number.isFinite(item?.life) ? item.life : null;
    const burnThreshold = Number.isFinite(item?.burnThreshold) ? item.burnThreshold : null;

    let damageColumn = 0;
    if (maxLife && currentLife !== null && currentLife < maxLife) {
        const ratio = currentLife / maxLife;
        if (ratio <= 0 || (burnThreshold !== null && currentLife <= burnThreshold)) {
            damageColumn = 2;
        } else if (ratio <= 0.66) {
            damageColumn = 1;
        }
    } else if (item?.isBurning) {
        damageColumn = 2;
    }
    damageColumn = Math.max(0, Math.min(2, damageColumn));

    const baseFrame = getItemTexture(
        baseTexture,
        `turret-base:${typeIndex}:${damageColumn}`,
        damageColumn * 48,
        typeIndex * 48,
        48,
        48
    );
    if (!baseFrame) {
        return;
    }
    itemTiles.addFrame(baseFrame, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);

    let orientation = 0;
    if (Number.isFinite(item.angle)) {
        orientation = parseInt((item.angle / 22.5) + 1, 10);
    }
    if (orientation >= 16 || orientation < 0) {
        orientation = 0;
    }
    const headTexture = getItemTexture(
        game.textures['imageTurretHead']?.baseTexture,
        `turret-head:${item.type}:${orientation}`,
        orientation * 48,
        (item.type - 9) * 48,
        48,
        48
    );
    if (headTexture) {
        itemTiles.addFrame(headTexture, item.x - game.player.offset.x + offTileX, item.y - game.player.offset.y + offTileY);
    }
};

var drawMine = (game, itemTiles, item, offTileX, offTileY) => {
    const mineTeam = item.city ?? item.teamId ?? null;
    const playerTeam = game.player?.city ?? null;
    if (item.active && mineTeam !== null && mineTeam !== playerTeam) {
        return;
    }
    const texture = getItemTexture(
        game.textures['imageItems']?.baseTexture,
        `mine:${ITEM_TYPE_MINE}`,
        ITEM_TYPE_MINE * 32,
        0,
        32,
        32
    );
    if (!texture) {
        return;
    }
    var drawX = item.x - game.player.offset.x + offTileX + 8;
    var drawY = item.y - game.player.offset.y + offTileY + 8;
    itemTiles.addFrame(texture, drawX, drawY);
};

var drawDFG = (game, itemTiles, item, offTileX, offTileY) => {
    const dfgTeam = item.city ?? item.teamId ?? null;
    const playerTeam = game.player?.city ?? null;
    if (item.active && dfgTeam !== null && dfgTeam !== playerTeam) {
        return;
    }
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const texture = getItemTexture(
        baseTexture,
        `dfg:${ITEM_TYPE_DFG}`,
        ITEM_TYPE_DFG * 48,
        42,
        48,
        48
    );
    if (!texture) {
        return;
    }
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

var drawBomb = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }

    const armed = !!item.active;
    const frame = armed
        ? new PIXI.Rectangle(144, 91, 48, 48)
        : new PIXI.Rectangle(ITEM_TYPE_BOMB * 48, 42, 48, 48);

    const texture = getItemTexture(
        baseTexture,
        `bomb:${armed ? 'armed' : 'idle'}`,
        frame.x,
        frame.y,
        frame.width,
        frame.height
    );
    if (!texture) {
        return;
    }
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const drawWall = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const texture = getItemTexture(
        baseTexture,
        `wall:${ITEM_TYPE_WALL}`,
        ITEM_TYPE_WALL * 48,
        42,
        48,
        48
    );
    if (!texture) {
        return;
    }
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const drawSleeper = (game, itemTiles, item, offTileX, offTileY) => {
    const itemTeam = item.city ?? item.teamId ?? null;
    const playerTeam = game.player?.city ?? null;
    const isFriendly = itemTeam === null || playerTeam === null || itemTeam === playerTeam;
    if (!isFriendly && !item.target) {
        return;
    }
    drawTurret(game, itemTiles, item, offTileX, offTileY);
};

const drawGenericItem = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const frameX = item.type * 48;
    const texture = getItemTexture(
        baseTexture,
        `item:${item.type}`,
        frameX,
        42,
        48,
        48
    );
    if (!texture) {
        return;
    }
    const drawX = item.x - game.player.offset.x + offTileX;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const ORB_WORLD_OFFSET_X = 4;

const drawOrb = (game, itemTiles, item, offTileX, offTileY) => {
    const baseTexture = game.textures['imageItems']?.baseTexture;
    if (!baseTexture) {
        return;
    }
    const frame = getOrbAnimationFrame(game);
    const texture = getItemTexture(
        baseTexture,
        `orb:${frame}`,
        ITEM_TYPE_ORB * 48,
        42 + (frame * 48),
        48,
        48
    );
    if (!texture) {
        return;
    }
    const drawX = item.x - game.player.offset.x + offTileX + ORB_WORLD_OFFSET_X;
    const drawY = item.y - game.player.offset.y + offTileY;
    itemTiles.addFrame(texture, drawX, drawY);
};

const rendererMap = {
    [ITEM_TYPE_TURRET]: drawTurret,
    [ITEM_TYPE_PLASMA]: drawTurret,
    [ITEM_TYPE_SLEEPER]: drawSleeper,
    [ITEM_TYPE_WALL]: drawWall,
    [ITEM_TYPE_MINE]: drawMine,
    [ITEM_TYPE_DFG]: drawDFG,
    [ITEM_TYPE_BOMB]: drawBomb,
    [ITEM_TYPE_ORB]: drawOrb,
};

const ITEM_RENDER_PRIORITY = {
    [ITEM_TYPE_MINE]: 0,
    // Always render walls after mines so allied players see walls covering traps.
    [ITEM_TYPE_WALL]: 1,
};

const getItemRenderPriority = (item) => {
    const priority = item ? ITEM_RENDER_PRIORITY[item.type] : null;
    return Number.isFinite(priority) ? priority : 0;
};

export const drawItems = (game, itemTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 48);
    var offTileY = Math.floor(game.player.offset.y % 48);

    if (game.tick > drawTick) {

        drawTick = game.tick + 200;
        itemTiles.clear();

        var foundItems = getItemsWithingRange(game.itemFactory, game.player);

        foundItems.sort((a, b) => {
            const priorityDelta = getItemRenderPriority(a) - getItemRenderPriority(b);
            if (priorityDelta !== 0) {
                return priorityDelta;
            }
            return 0;
        });

        foundItems.forEach((item) => {
            switch (item.type) {
                default: {
                    const renderer = rendererMap[item.type];
                    if (renderer) {
                        renderer(game, itemTiles, item, offTileX, offTileY);
                    } else {
                        drawGenericItem(game, itemTiles, item, offTileX, offTileY);
                    }
                    break;
                }
            }

        });

        itemTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);

        //console.log("Moving item tiles");
    }

    itemTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
