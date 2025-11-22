import {rectangleCollision} from "./collision-helpers.js";
import {checkTiles} from "./collision-helpers.js";
import {checkEdges} from "./collision-helpers.js";
import {getPlayerRect} from "./collision-helpers.js";
import {checkItems} from "./collision-helpers.js";


var checkPlayers = (game, buildingRect) => {


    if (rectangleCollision(buildingRect, getPlayerRect(game.player))) {
        return true;
    }

    return Object.keys(game.otherPlayers).some((id) => {
        return rectangleCollision(getPlayerRect(game.otherPlayers[id]), buildingRect)
    });

};

var checkBuildings = (game, buildingRect) => {
    var buildingNode = game.buildingFactory.getHead();

    while (buildingNode) {

        var buildingRect2 = {
            x: (buildingNode.x) * 48,
            y: (buildingNode.y) * 48,
            w: 144,
            h: 144,
        };

        if (rectangleCollision(buildingRect, buildingRect2)) {
            return true;
        }

        buildingNode = buildingNode.next;
    }

    return false;
};

export const checkBuildingCollision = (game, building) => {


    var buildingRect = {
        x: (building.x) * 48,
        y: (building.y) * 48,
        w: 140,
        h: 140,
    };


    var collision = checkEdges(getPlayerRect(game.player));
    if (collision) {
        console.log("Collided with edges");
        return collision;
    }

    collision = checkTiles(game, buildingRect);
    if (collision) {
        console.log("Collided with tiles");
        return collision;
    }


    collision = checkBuildings(game, buildingRect);
    if (collision) {
        console.log("Collided with buildings");
        return collision;
    }

    collision = checkPlayers(game, buildingRect);
    if (collision) {
        console.log("Collided with buildings");
        return collision;
    }

    collision = checkItems(game, buildingRect);


    return collision
};
