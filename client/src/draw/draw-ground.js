const TILE_SIZE = 128;
const REDRAW_RADIUS_TILES = 5;

var minX = 0;
var maxX = 0;
var minY = 0;
var maxY = 0;

const modulo = (value, divisor) => {
    const remainder = value % divisor;
    return remainder < 0 ? remainder + divisor : remainder;
};

export const drawGround = (game, groundTiles) => {
    if (!game || !groundTiles || !game.player || !game.player.offset || !game.player.defaultOffset) {
        return;
    }

    const cameraX = Number.isFinite(game.player.offset.x) ? game.player.offset.x : 0;
    const cameraY = Number.isFinite(game.player.offset.y) ? game.player.offset.y : 0;
    const groundOffsetX = modulo(cameraX, TILE_SIZE);
    const groundOffsetY = modulo(cameraY, TILE_SIZE);
    const tileX = cameraX / TILE_SIZE;
    const tileY = cameraY / TILE_SIZE;

    if (tileX > maxX
        || tileX < minX
        || tileY > maxY
        || tileY < minY
    ) {
        minX = tileX - REDRAW_RADIUS_TILES;
        maxX = tileX + REDRAW_RADIUS_TILES;
        minY = tileY - REDRAW_RADIUS_TILES;
        maxY = tileY + REDRAW_RADIUS_TILES;
        groundTiles.clear();
        for (var i = -12; i < 12; i++) {
            for (var j = -12; j < 12; j++) {
                groundTiles.addFrame(game.textures["groundTexture"], i * TILE_SIZE, j * TILE_SIZE);
            }
        }
    }

    groundTiles.position.set(
        game.player.defaultOffset.x + cameraX - groundOffsetX,
        game.player.defaultOffset.y + cameraY - groundOffsetY
    );
    groundTiles.pivot.set(cameraX, cameraY);
};
