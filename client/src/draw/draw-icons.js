import PIXI from '../pixi';
import { ITEM_TYPE_ORB } from "../constants";
import { getOrbAnimationFrame } from '../utils/orbAnimation';

var getIconsWithinRange = function (iconFactory, player) {

    var icon = iconFactory.getHead();
    var range = 40 * 48;
    var foundIcons = [];
    while (icon) {

        //no one is holding it
        if (icon.owner == null) {
            if (icon.x > (player.offset.x - range)
                && icon.x < (player.offset.x + range)
                && icon.y > (player.offset.y - range)
                && icon.y < (player.offset.y + range)
            ) {
                foundIcons.push(icon)
            }
        }
        icon = icon.next;
    }

    return foundIcons
};

let lastOrbIconFrame = null;

export const drawIcons = (game, iconTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 32);
    var offTileY = Math.floor(game.player.offset.y % 32);


    const orbFrame = getOrbAnimationFrame(game);
    const needsUpdate = game.forceDraw || (lastOrbIconFrame === null) || (orbFrame !== lastOrbIconFrame);

    if (needsUpdate) {
        lastOrbIconFrame = orbFrame;
        iconTiles.clear();

        var foundItems = getIconsWithinRange(game.iconFactory, game.player);
        foundItems.forEach((icon) => {
            const baseTexture = game.textures['imageItems'].baseTexture;
            if (!baseTexture) {
                return;
            }
            let frameX = icon.type * 32;
            let frameY = 0;
            let frameWidth = 32;
            let frameHeight = 32;
            let drawX = icon.x - game.player.offset.x + offTileX;
            const drawY = icon.y - game.player.offset.y + offTileY;
            if (icon.type === ITEM_TYPE_ORB) {
                frameX = 250;
                frameY = 41 + (orbFrame * 48);
                frameWidth = 32;
                frameHeight = 32;
                drawX += 2;
            }
            var tmpText = new PIXI.Texture(
                baseTexture,
                new PIXI.Rectangle(frameX, frameY, frameWidth, frameHeight)
            );
            iconTiles.addFrame(tmpText, drawX, drawY);
        });

        iconTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);
    }

    iconTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
