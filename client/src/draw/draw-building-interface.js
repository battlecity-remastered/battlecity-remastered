import PIXI from "../pixi";
import { scheduleDestroy } from "../utils/pixiPerformance";

import { LABELS } from "../constants";
import { CAN_BUILD, RESEARCH_PENDING } from "../constants";

var menuContainer = new PIXI.Container();
let activeGhostBuilding = null;
let pointerMoveListener = null;

function buildDemolishMenuItem(game) {
    var click = (e) => {
        e.stopPropagation();
        console.log("Setting is demolishing to true");
        game.isDemolishing = true;
        game.stage.cursor = "demolish";
        if (game.interactionLayer) {
            game.interactionLayer.cursor = "demolish";
        }
    };

    var tmpText = new PIXI.Texture(
        game.textures["buildingIcons"].baseTexture,
        new PIXI.Rectangle(13 * 16, 0, 16, 16),
    );

    var buildIcon = new PIXI.Sprite(tmpText);
    buildIcon.x = game.buildMenuOffset.x - 16;
    buildIcon.y = game.buildMenuOffset.y;
    buildIcon.interactive = true;
    buildIcon.iconType = 13;
    buildIcon.on("mousedown", click);

    var basicText = new PIXI.Text("Demolish building", {
        fontSize: 12,
        fill: 0xffffff,
    });
    basicText.x = game.buildMenuOffset.x;
    basicText.y = game.buildMenuOffset.y;
    basicText.interactive = true;
    basicText.on("mousedown", click);

    menuContainer.addChild(buildIcon);
    menuContainer.addChild(basicText);
}

const clearGhostBuilding = (game) => {
    if (pointerMoveListener && game.interactionLayer) {
        game.interactionLayer.off("pointermove", pointerMoveListener);
        pointerMoveListener = null;
    }
    if (activeGhostBuilding) {
        scheduleDestroy(activeGhostBuilding, { minDelay: 0, maxDelay: 120, destroyTexture: true, destroyBaseTexture: false });
        activeGhostBuilding = null;
    }
    game.isBuilding = false;
    game.isDragging = false;
    game.showBuildMenu = false;
    menuContainer.visible = false;
    if (game.interactionLayer) {
        game.interactionLayer.cursor = "cursor";
    }
};

const startGhostBuilding = (game, buildingType, pointerData) => {
    clearGhostBuilding(game);

    game.isBuilding = buildingType;
    game.isDragging = true;
    game.showBuildMenu = false;
    menuContainer.visible = false;

    const tmpText = new PIXI.Texture(
        game.textures["buildings"].baseTexture,
        new PIXI.Rectangle(0, parseInt(game.isBuilding / 100) * 144, 144, 144),
    );

    const building = new PIXI.Sprite(tmpText);
    building.alpha = 0.5;
    building.interactive = false;
    building.buttonMode = false;
    // Center the sprite anchor so cursor is in the middle of the building
    building.anchor.set(0.5, 0.5);

    game.stage.addChild(building);
    activeGhostBuilding = building;

    const updatePosition = (interactionData) => {
        let global;
        if (interactionData && interactionData.global) {
            global = interactionData.global;
        } else if (
            game.app &&
      game.app.renderer &&
      game.app.renderer.plugins &&
      game.app.renderer.plugins.interaction
        ) {
            const interaction = game.app.renderer.plugins.interaction;
            const pointer = interaction.pointer || interaction.mouse;
            if (pointer && pointer.global) {
                global = pointer.global;
            }
        }

        if (!global) {
            return;
        }

        // Since we want the cursor in the CENTER of the building (not top-left),
        // offset the cursor position by half the building size before tile calculation
        // Buildings are 144x144 pixels (3x3 tiles at 48px each)
        const halfBuildingSize = 144 / 2; // 72 pixels
        const adjustedGlobalX = global.x - halfBuildingSize;
        const adjustedGlobalY = global.y - halfBuildingSize;

        // Use the same tile-grid calculation as actual placement (input-mouse.js lines 35-38)
        const offTileX = Math.floor(game.player.offset.x % 48);
        const offTileY = Math.floor(game.player.offset.y % 48);
        const tileX = Math.floor(
            (game.player.offset.x -
        game.player.defaultOffset.x +
        offTileX +
        adjustedGlobalX) /
        48,
        );
        const tileY = Math.floor(
            (game.player.offset.y -
        game.player.defaultOffset.y +
        offTileY +
        adjustedGlobalY) /
        48,
        );

        // Convert tile coordinates back to world pixel coordinates for rendering
        const worldPixelX = tileX * 48;
        const worldPixelY = tileY * 48;

        // Since the building anchor is centered (0.5, 0.5), position at the center of the grid
        const centeredWorldX = worldPixelX + halfBuildingSize;
        const centeredWorldY = worldPixelY + halfBuildingSize;

        // Transform world coordinates back to screen coordinates
        const screenX =
      centeredWorldX - game.player.offset.x + game.player.defaultOffset.x;
        const screenY =
      centeredWorldY - game.player.offset.y + game.player.defaultOffset.y;

        // Set position directly in screen space
        building.position.set(screenX, screenY);
    };

    if (game.interactionLayer) {
        pointerMoveListener = (event) => updatePosition(event.data);
        game.interactionLayer.on("pointermove", pointerMoveListener);
        game.interactionLayer.cursor = "pointer";
    }

    updatePosition(pointerData);
};

export const setupBuildingMenu = (game) => {
    if (!game || !game.stage) {
        return;
    }

    const isMayor = !!(game && game.player && game.player.isMayor);
    if (!isMayor) {
        clearGhostBuilding(game);
        menuContainer.visible = false;
        if (!menuContainer.parent) {
            game.stage.addChild(menuContainer);
        }
        return;
    }

    const playerCity = Number.isFinite(game?.player?.city)
        ? game.player.city
        : null;
    const cityState =
    playerCity !== null && Array.isArray(game?.cities)
        ? game.cities[playerCity]
        : null;
    const canBuild = cityState?.canBuild;

    if (!canBuild) {
        clearGhostBuilding(game);
        menuContainer.visible = false;
        if (!menuContainer.parent) {
            game.stage.addChild(menuContainer);
        }
        return;
    }

    if (game.forceDraw) {
        menuContainer.removeChildren();

        var canBuildList = Object.keys(canBuild);

        var y = 1;
        const textStyle = new PIXI.TextStyle({
            fontSize: 12,
            fill: 0xffffff,
        });
        let menuWidth = 180;
        let longestLabelWidth = 0;

        canBuildList.forEach((id) => {
            if (canBuild[id] === CAN_BUILD || canBuild[id] === RESEARCH_PENDING) {
                y++;
                const isPending = canBuild[id] === RESEARCH_PENDING;
                const label = isPending ? `${LABELS[id].LABEL} (researching)` : LABELS[id].LABEL;
                const metrics = PIXI.TextMetrics.measureText(label, textStyle);
                longestLabelWidth = Math.max(longestLabelWidth, metrics.width);
            }
        });

        menuWidth = Math.max(menuWidth, longestLabelWidth + 32);

        var graphics = new PIXI.Graphics();
        graphics.lineStyle(2, 0x00000, 0);
        graphics.beginFill(0x000000, 1);
        graphics.drawRect(
            game.buildMenuOffset.x,
            game.buildMenuOffset.y,
            menuWidth,
            y * 16,
        );
        graphics.endFill();
        menuContainer.addChild(graphics);

        buildDemolishMenuItem(game);

        y = 1;
        canBuildList.forEach((id) => {
            if (canBuild[id] === CAN_BUILD || canBuild[id] === RESEARCH_PENDING) {
                var buildingType = LABELS[id].TYPE;
                const isPending = canBuild[id] === RESEARCH_PENDING;

                var click = (e) => {
                    e.stopPropagation();
                    startGhostBuilding(game, buildingType, e.data);
                };

                if (isPending) {
                    click = (e) => {
                        e.stopPropagation();
                        if (game.notify) {
                            game.notify({
                                title: 'Research In Progress',
                                message: 'Factory unlocks once research completes.',
                                variant: 'info',
                                timeout: 3200
                            });
                        }
                    };
                }

                var tmpText = new PIXI.Texture(
                    game.textures["buildingIcons"].baseTexture,
                    new PIXI.Rectangle(LABELS[id].ICON * 16, 0, 16, 16),
                );

                var buildIcon = new PIXI.Sprite(tmpText);
                buildIcon.x = game.buildMenuOffset.x - 16;
                buildIcon.y = game.buildMenuOffset.y + y * 16;
                buildIcon.interactive = true;
                buildIcon.iconType = LABELS[id].IMAGE;
                buildIcon.on("mousedown", click);

                const label = isPending ? `${LABELS[id].LABEL} (researching)` : LABELS[id].LABEL;
                const effectiveStyle = new PIXI.TextStyle({
                    fontSize: 12,
                    fill: isPending ? 0xaaaaaa : 0xffffff,
                });
                var basicText = new PIXI.Text(label, effectiveStyle);
                basicText.x = game.buildMenuOffset.x;
                basicText.y = game.buildMenuOffset.y + y * 16;
                basicText.interactive = true;
                basicText.on("mousedown", click);

                if (isPending) {
                    buildIcon.alpha = 0.5;
                    basicText.alpha = 0.8;
                }

                menuContainer.addChild(buildIcon);
                menuContainer.addChild(basicText);

                y++;
            }
        });

        menuContainer.visible = false;
    }

    if (!menuContainer.parent) {
        game.stage.addChild(menuContainer);
    }
    game.clearGhostBuilding = () => clearGhostBuilding(game);
    game.startGhostBuilding = (type, data) =>
        startGhostBuilding(game, type, data);
};

function addBuilding(game) {
    if (game.isBuilding && !activeGhostBuilding) {
        startGhostBuilding(game, game.isBuilding, null);
    }
}

export const drawBuilding = (game) => {
    if (!game.isDragging && !game.isDemolishing) {
        menuContainer.visible = game.showBuildMenu;
    }

    addBuilding(game);
};
