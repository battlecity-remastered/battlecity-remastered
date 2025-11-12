import PIXI from '../pixi';

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

export const drawIcons = (game, iconTiles) => {


    var offTileX = Math.floor(game.player.offset.x % 32);
    var offTileY = Math.floor(game.player.offset.y % 32);


    if (game.forceDraw) {
        iconTiles.clear();

        var foundItems = getIconsWithinRange(game.iconFactory, game.player);
        foundItems.forEach((icon) => {
            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(icon.type * 32, 0, 32, 32)
            );
            iconTiles.addFrame(tmpText, icon.x - game.player.offset.x + offTileX, icon.y - game.player.offset.y + offTileY);
        });

        iconTiles.position.set(game.player.defaultOffset.x + game.player.offset.x - offTileX, game.player.defaultOffset.y + game.player.offset.y - offTileY);
    }

    iconTiles.pivot.set(game.player.offset.x, game.player.offset.y);
};
