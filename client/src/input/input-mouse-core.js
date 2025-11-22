import { MAP_SQUARE_BUILDING } from "../constants.js";

export const setupMouseInputsWithPixi = (game, pixiInstance) => {
    if (!pixiInstance || !pixiInstance.Container || !pixiInstance.Rectangle) {
        throw new Error("A valid PIXI instance with Container and Rectangle is required.");
    }

    let gameArea = new pixiInstance.Container();
    const syncHitArea = () => {
        gameArea.hitArea = new pixiInstance.Rectangle(0, 0, game.maxMapX, game.maxMapY);
    };
    syncHitArea();

    gameArea.interactive = true;
    gameArea.interactiveChildren = false;
    gameArea.cursor = "cursor";
    game.stage.addChild(gameArea);
    game.interactionLayer = gameArea;
    game.updateInteractionHitArea = syncHitArea;

    gameArea.on("mousedown", (event) => {
        console.log("Got mouse down event");
        if (!game?.player?.isMayor) {
            if (game.notify) {
                game.notify({
                    title: "Construction Restricted",
                    message: "Only mayors can place or demolish city structures.",
                    variant: "warn",
                    timeout: 3200,
                });
            } else {
                console.warn(
                    "Construction restricted: only mayors may build or demolish.",
                );
            }
            if (game.clearGhostBuilding) {
                game.clearGhostBuilding();
            }
            game.showBuildMenu = false;
            game.isDemolishing = false;
            return;
        }
        if (game.isBuilding && game.isDragging) {
            // Adjust for centered cursor - buildings are 144px, so offset by half (72px)
            var halfBuildingSize = 72;
            var adjustedX = event.data.global.x - halfBuildingSize;
            var adjustedY = event.data.global.y - halfBuildingSize;

            var offTileXBuild = Math.floor(game.player.offset.x % 48);
            var offTileYBuild = Math.floor(game.player.offset.y % 48);
            var placeX = Math.floor(
                (game.player.offset.x -
          game.player.defaultOffset.x +
          offTileXBuild +
          adjustedX) /
          48,
            );
            var placeY = Math.floor(
                (game.player.offset.y -
          game.player.defaultOffset.y +
          offTileYBuild +
          adjustedY) /
          48,
            );

            if (
                game.buildingFactory.newBuilding(
                    game.player.id,
                    placeX,
                    placeY,
                    game.isBuilding,
                )
            ) {
                game.map[placeX][placeY] = MAP_SQUARE_BUILDING;
                game.tiles[placeX][placeY] = game.isBuilding;
                game.forceDraw = true;
                if (game.clearGhostBuilding) {
                    game.clearGhostBuilding();
                }
            }
            return;
        }

        if (!game.isDemolishing) {
            game.showBuildMenu = !game.showBuildMenu;
            game.forceDraw = true;
            game.buildMenuOffset = {
                x: event.data.global.x,
                y: event.data.global.y,
            };
        }
        if (game.isDemolishing) {
            console.log("Trying to demolish building");
            var offTileX = Math.floor(game.player.offset.x % 48);
            var offTileY = Math.floor(game.player.offset.y % 48);
            var x = Math.floor(
                (game.player.offset.x -
          game.player.defaultOffset.x +
          offTileX +
          event.data.global.x) /
          48,
            );
            var y = Math.floor(
                (game.player.offset.y -
          game.player.defaultOffset.y +
          offTileY +
          event.data.global.y) /
          48,
            );

            const demolished = game.buildingFactory.demolishBuilding(x, y);
            if (!demolished) {
                game.isDemolishing = false;
                game.stage.cursor = "cursor";
                game.interactionLayer.cursor = "cursor";
            }
            return;
        }
    });

    gameArea.on("rightdown", (event) => {
        if (event.stopPropagation) {
            event.stopPropagation();
        }
        if (
            event.data &&
      event.data.originalEvent &&
      event.data.originalEvent.preventDefault
        ) {
            event.data.originalEvent.preventDefault();
        }
        if (game.isBuilding && game.clearGhostBuilding) {
            game.clearGhostBuilding();
        }
        if (game.isDemolishing) {
            game.isDemolishing = false;
            game.stage.cursor = "cursor";
            game.interactionLayer.cursor = "cursor";
        }

        const global = event && event.data ? event.data.global : null;
        if (!global) {
            if (typeof game.clearPanelMessage === "function") {
                game.clearPanelMessage();
            }
            return;
        }

        if (
            global.x < 0 ||
      global.y < 0 ||
      global.x > game.maxMapX ||
      global.y > game.maxMapY
        ) {
            if (typeof game.clearPanelMessage === "function") {
                game.clearPanelMessage();
            }
            return;
        }

        const offTileX = Math.floor(game.player.offset.x % 48);
        const offTileY = Math.floor(game.player.offset.y % 48);
        const tileX = Math.floor(
            (game.player.offset.x -
        game.player.defaultOffset.x +
        offTileX +
        global.x) /
        48,
        );
        const tileY = Math.floor(
            (game.player.offset.y -
        game.player.defaultOffset.y +
        offTileY +
        global.y) /
        48,
        );

        const buildingFactory = game.buildingFactory;
        const building =
      buildingFactory && buildingFactory.findBuildingAtTile
          ? buildingFactory.findBuildingAtTile(tileX, tileY)
          : null;
        if (!building) {
            if (typeof game.clearPanelMessage === "function") {
                game.clearPanelMessage();
            }
            return;
        }

        const cityValue = Number.isFinite(building.city)
            ? building.city
            : parseInt(building.city, 10);
        const cityId = Number.isFinite(cityValue) ? cityValue : 0;

        if (
            game.socketListener &&
      typeof game.socketListener.requestCityInfo === "function"
        ) {
            game.socketListener.requestCityInfo(cityId);
        }

        if (typeof game.showCityInfo === "function") {
            game.showCityInfo(cityId, {
                source: "local",
                building: building,
            });
        }
    });
};
