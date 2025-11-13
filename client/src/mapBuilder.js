import {MAP_SQUARE_LAVA} from "./constants";
import {MAP_SQUARE_ROCK} from "./constants";
import {MAP_SQUARE_BUILDING} from "./constants";
import {BUILDING_COMMAND_CENTER} from "./constants";
import {findCityIdByTile} from "./utils/citySpawns";

function createMap(game) {
    for (var i = 0; i < 512; i++) {
        game.map[i] = [];
        for (var j = 0; j < 512; j++) {
            game.map[i][j] = 0
        }
    }
}

function createTiles(game) {
    for (var i = 0; i < 512; i++) {
        game.tiles[i] = [];
        for (var j = 0; j < 512; j++) {
            game.tiles[i][j] = 0
        }
    }
}

/**
 *
 * Calculates the correct tile to return based on adjacent tiles
 *
 * Examples If calculating middle tiles picture
 * 010
 * 111   = 0
 * 010
 *
 * 000
 * 010  = 720
 * 000
 *
 * 000
 * 011  = 670 etc etc
 * 000
 *
 * @type {number}
 */
function populateTiles(game, mapData) {
    const size = 512;
    const view = new Uint8Array(mapData);

    for (let i = 0; i < size; i++) {
        for (let j = 0; j < size; j++) {
            const sourceX = (size - 1) - j;
            const sourceY = (size - 1) - i;
            game.map[i][j] = view[sourceX + (sourceY * size)];
        }
    }

    for (let j = 0; j < game.map.length; j++) {
        for (let i = 0; i < game.map.length; i++) {
            if (game.map[i][j] === MAP_SQUARE_BUILDING) {
                const cityId = findCityIdByTile(i, j);
                game.buildingFactory.newBuilding(null, i, j, BUILDING_COMMAND_CENTER, {
                    notifyServer: false,
                    city: cityId ?? 0,
                    updateCity: false,
                    itemsLeft: 0,
                });
            } else if (game.map[i][j] === MAP_SQUARE_LAVA || game.map[i][j] === MAP_SQUARE_ROCK) {
                const currentTile = game.map[i][j];
                const isLeft = (i === 0 || game.map[i - 1][j] !== currentTile) ? 1 : 0;
                const isRight = (i === (size - 1) || game.map[i + 1][j] !== currentTile) ? 1 : 0;
                const isUp = (j === 0 || game.map[i][j - 1] !== currentTile) ? 1 : 0;
                const isDown = (j === (size - 1) || game.map[i][j + 1] !== currentTile) ? 1 : 0;
                game.tiles[i][j] = (isLeft + (isRight * 2) + (isDown * 4) + (isUp * 8)) * 48;
            }
        }
    }
}

export const build = (game, mapData) => {
    createMap(game);
    createTiles(game);
    populateTiles(game, mapData);

};
