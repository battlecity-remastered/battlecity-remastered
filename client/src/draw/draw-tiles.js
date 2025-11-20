import PIXI from '../pixi';

import { MAP_SQUARE_LAVA } from "../constants";
import { MAP_SQUARE_ROCK } from "../constants";
import { MAP_SQUARE_BUILDING } from "../constants";
import { BUILDING_COMMAND_CENTER } from "../constants";
import { BUILDING_FACTORY } from "../constants";
import { BUILDING_RESEARCH } from "../constants";
import { BUILDING_HOUSE } from "../constants";
import { BUILDING_REPAIR } from "../constants";
import { POPULATION_MAX_HOUSE } from "../constants";
import { POPULATION_MAX_NON_HOUSE } from "../constants";
import { getCityDisplayName } from '../utils/citySpawns';
import { scheduleDestroy } from '../utils/pixiPerformance';

var minTX = 0;
var maxTX = 0;
var minTY = 0;
var maxTY = 0;

const TILE_SIZE = 48;
const REDRAW_RADIUS_TILES = 24;
const VIEW_RADIUS_TILES = 40;
const COMMAND_CENTER_LABEL_STYLE = Object.freeze({
    fontFamily: 'Arial',
    fontSize: 14,
    fontWeight: 'bold',
    fill: 0xF2F6FF,
    align: 'center',
    stroke: 0x000000,
    strokeThickness: 4,
    lineHeight: 16,
    wordWrap: true,
    wordWrapWidth: 120,
});
const COMMAND_CENTER_LABEL_RESOLUTION = 2;
const COMMAND_CENTER_LABEL_OFFSET_Y = -32;
const textureCache = new Map();

const getSubTexture = (baseTexture, cacheKey, x, y, width, height) => {
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

const getCameraPosition = (game) => {
    const offsetX = Number.isFinite(game.player?.offset?.x) ? game.player.offset.x : 0;
    const offsetY = Number.isFinite(game.player?.offset?.y) ? game.player.offset.y : 0;
    return {
        rawX: offsetX,
        rawY: offsetY,
        pixelX: Math.floor(offsetX),
        pixelY: Math.floor(offsetY)
    };
};

const modulo = (value, divisor) => {
    const remainder = value % divisor;
    return remainder < 0 ? remainder + divisor : remainder;
};

const ensureLayers = (backgroundTiles) => {
    if (!backgroundTiles.tileLayer) {
        backgroundTiles.tileLayer = new PIXI.tilemap.CompositeRectTileLayer(0, null, true);
        backgroundTiles.addChild(backgroundTiles.tileLayer);
    }
    if (!backgroundTiles.edgeOverlay) {
        const overlay = new PIXI.Graphics();
        overlay.alpha = 1;
        backgroundTiles.edgeOverlay = overlay;
        backgroundTiles.addChild(overlay);
    } else if (!backgroundTiles.edgeOverlay.parent) {
        backgroundTiles.addChild(backgroundTiles.edgeOverlay);
    }
    if (!backgroundTiles.commandCenterLabelLayer) {
        const labels = new PIXI.Container();
        labels.name = 'commandCenterLabelLayer';
        backgroundTiles.commandCenterLabelLayer = labels;
        backgroundTiles.addChild(labels);
    }
};

var drawLava = (game, tileLayer, i, j, tileX, tileY) => {
    const texture = getSubTexture(
        game.textures['lavaTexture']?.baseTexture,
        `lava:${game.tiles[tileX][tileY]}`,
        game.tiles[tileX][tileY],
        0,
        TILE_SIZE,
        TILE_SIZE
    );
    if (!texture) {
        return;
    }
    tileLayer.addFrame(texture, i * TILE_SIZE, j * TILE_SIZE);
};


var drawRocks = (game, tileLayer, i, j, tileX, tileY) => {
    const texture = getSubTexture(
        game.textures['rockTexture']?.baseTexture,
        `rock:${game.tiles[tileX][tileY]}`,
        game.tiles[tileX][tileY],
        0,
        TILE_SIZE,
        TILE_SIZE
    );
    if (!texture) {
        return;
    }
    tileLayer.addFrame(texture, i * TILE_SIZE, j * TILE_SIZE);
};


var drawBuilding = (game, tileLayer, i, j, tileX, tileY) => {


    var type = game.tiles[tileX][tileY];
    var subType = type % 100;
    var baseType = parseInt(type / 100, 10);

    const building = game.buildingFactory.getBuildingByCoord(tileX, tileY);



    const baseTexture = getSubTexture(
        game.textures['buildings']?.baseTexture,
        `building:${baseType}`,
        0,
        baseType * 144,
        144,
        144
    );
    if (!baseTexture) {
        return;
    }

    // Draw research status icon BEFORE building so it appears behind
    if (baseType === BUILDING_RESEARCH && building && game.buildingFactory) {
        const researchState = typeof game.buildingFactory.getResearchState === 'function'
            ? game.buildingFactory.getResearchState(building.city, building.type)
            : null;

        // Default to red bar (imgResearch), only show complete bar when research is done
        let researchTextureName = 'imgResearch';
        if (researchState?.state === 'complete') {
            researchTextureName = 'imgResearchComplete';
        }

        if (researchTextureName && game.textures[researchTextureName]) {
            // Create scaled and cropped texture
            const baseTexture = game.textures[researchTextureName].baseTexture;

            // Crop 5px from top and bottom (original height 144px, cropped to 134px)
            const cropTop = 5;
            const cropBottom = 5;
            const croppedHeight = 144 - cropTop - cropBottom; // 134px

            const researchTexture = new PIXI.Texture(
                baseTexture,
                new PIXI.Rectangle(0, cropTop, baseTexture.width, croppedHeight)
            );

            // Scale to 90% of cropped size
            const scaledWidth = 9;  // 10px * 0.9
            const scaledHeight = Math.floor(croppedHeight * 0.9); // 134px * 0.9 ≈ 121px

            // Position 2px more left (x+130), moved up 5px
            const researchX = (i * TILE_SIZE) + 130;
            const researchY = (j * TILE_SIZE) + Math.floor((144 - scaledHeight) / 2) - 5;

            // Add the scaled sprite to the tile layer
            tileLayer.addFrame(researchTexture, researchX, researchY, scaledWidth / baseTexture.width, scaledHeight / croppedHeight);
        }
    }

    tileLayer.addFrame(baseTexture, i * TILE_SIZE, j * TILE_SIZE, 1, 0);

    let buildingOverlayTexture = null;
    try {
        buildingOverlayTexture = getSubTexture(
            game.textures['imageItems']?.baseTexture,
            `buildingOverlay:${subType}`,
            subType * 32,
            0,
            32,
            32
        );
    } catch (_ex) {
        buildingOverlayTexture = null;
    }

    if (buildingOverlayTexture) {
        switch (baseType) {
            case BUILDING_RESEARCH:
                tileLayer.addFrame(buildingOverlayTexture, (i * TILE_SIZE) + 14, (j * TILE_SIZE) + 98);
                break;
            case BUILDING_FACTORY:
                tileLayer.addFrame(buildingOverlayTexture, (i * TILE_SIZE) + 56, (j * TILE_SIZE) + 52);
                break;
        }
    }

    if (building && building.population > 0 && game.textures['population']) {
        const frameWidth = TILE_SIZE;
        const frameHeight = TILE_SIZE;
        const columns = 7;
        const maxStage = columns - 1; // stages 0-6 per original sprite sheet
        const buildingFamily = building ? Math.floor(Number(building.type) / 100) : baseType;
        const isHouseBuilding = buildingFamily === BUILDING_HOUSE;
        const isCommandCenter = buildingFamily === BUILDING_COMMAND_CENTER;
        const maxPop = isHouseBuilding ? POPULATION_MAX_HOUSE : POPULATION_MAX_NON_HOUSE;
        if (maxPop > 0) {
            const clampedPop = Math.max(0, Math.min(maxPop, building.population));
            const frameIndex = Math.min(maxStage, Math.floor((clampedPop * maxStage) / maxPop));
            const frameColumn = frameIndex; // single row progression (0-6)
            const frameRow = isCommandCenter ? 1 : 0;

            const populationTexture = getSubTexture(
                game.textures['population']?.baseTexture,
                `population:${frameRow}:${frameColumn}`,
                frameColumn * frameWidth,
                frameRow * frameHeight,
                frameWidth,
                frameHeight
            );
            if (!populationTexture) {
                return;
            }

            const populationOffsets = {
                [BUILDING_COMMAND_CENTER]: { x: 96, y: 49 },
                [BUILDING_FACTORY]: { x: 96, y: 48 },
                [BUILDING_REPAIR]: { x: 96, y: 48 },
                [BUILDING_HOUSE]: { x: 96, y: 90 },
                [BUILDING_RESEARCH]: { x: 96, y: 90 },
            };

            const { x: offsetX = 96, y: offsetY = 48 } =
                populationOffsets[buildingFamily] ||
                populationOffsets[baseType] ||
                { x: 96, y: 48 };

            const overlayX = (i * TILE_SIZE) + offsetX;
            const overlayY = (j * TILE_SIZE) + offsetY;

            tileLayer.addFrame(populationTexture, overlayX, overlayY);
        }
    }

    if (baseType === BUILDING_FACTORY && building && building.smokeActive && game.textures['smoke']) {
        const smokeFrame = Math.max(0, (building.smokeFrame || 1) - 1);
        const smokeTexture = getSubTexture(
            game.textures['smoke']?.baseTexture,
            `smoke:${smokeFrame}`,
            0,
            smokeFrame * 60,
            180,
            60
        );
        if (smokeTexture) {
            const smokeX = (i * TILE_SIZE) + 6;
            const smokeY = (j * TILE_SIZE) - 15;
            tileLayer.addFrame(smokeTexture, smokeX, smokeY);
        }
    }

    if (baseType === BUILDING_FACTORY && building && typeof building.itemsLeft === 'number' && game.textures['blackNumbers']) {
        const cappedValue = Math.max(0, Math.min(99, Math.floor(building.itemsLeft)));
        const tens = Math.floor(cappedValue / 10);
        const ones = cappedValue % 10;

        const addDigit = (digit, offsetX) => {
            const digitTexture = getSubTexture(
                game.textures['blackNumbers']?.baseTexture,
                `digit:${digit}`,
                digit * 16,
                0,
                16,
                16
            );
            if (digitTexture) {
                tileLayer.addFrame(digitTexture, (i * TILE_SIZE) + offsetX, (j * TILE_SIZE) + 84);
            }
        };

        addDigit(tens, 56);
        addDigit(ones, 72);
    }

};

const toFinite = (value, fallback = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
};

const syncCommandCenterLabels = (game) => {
    if (!game || !game.buildingFactory) {
        return;
    }
    const labelLayer = game.commandCenterLabelLayer;
    if (!labelLayer) {
        return;
    }

    if (!game.commandCenterLabelCache) {
        game.commandCenterLabelCache = new Map();
    }
    const cache = game.commandCenterLabelCache;
    const activeKeys = new Set();

    let node = typeof game.buildingFactory.getHead === 'function'
        ? game.buildingFactory.getHead()
        : null;

    while (node) {
        const typeNumeric = Number(node.type);
        const baseType = Number.isFinite(typeNumeric) ? Math.floor(typeNumeric / 100) : null;
        const isCommandCenter = typeNumeric === BUILDING_COMMAND_CENTER || baseType === BUILDING_COMMAND_CENTER;
        if (isCommandCenter) {
            const key = node.id || `${node.x}_${node.y}`;
            activeKeys.add(key);

            const baseTileX = toFinite(node.x, 0);
            const baseTileY = toFinite(node.y, 0);
            const centerX = (baseTileX + 1.5) * TILE_SIZE;
            const centerY = (baseTileY + 1.5) * TILE_SIZE;
            const cityName = getCityDisplayName(node.city ?? 0);

            let record = cache.get(key);
            if (!record) {
                const label = new PIXI.Text(cityName, COMMAND_CENTER_LABEL_STYLE);
                label.anchor.set(0.5);
                label.resolution = COMMAND_CENTER_LABEL_RESOLUTION;
                labelLayer.addChild(label);
                record = { label, text: cityName, worldX: centerX, worldY: centerY };
                cache.set(key, record);
            } else if (record.text !== cityName) {
                record.label.text = cityName;
                record.text = cityName;
            }

            record.worldX = centerX;
            record.worldY = centerY;
        }
        node = node.next;
    }

    cache.forEach((record, key) => {
        if (!activeKeys.has(key)) {
            if (record && record.label) {
                if (record.label.parent) {
                    record.label.parent.removeChild(record.label);
                }
                scheduleDestroy(record.label, { minDelay: 16, maxDelay: 200 });
            }
            cache.delete(key);
        }
    });
};

const updateCommandCenterLabelVisibility = (game, camera) => {
    if (!game?.commandCenterLabelCache) {
        return;
    }
    const cache = game.commandCenterLabelCache;
    const threshold = VIEW_RADIUS_TILES * TILE_SIZE;
    const defaultOffsetX = Number.isFinite(game.player?.defaultOffset?.x) ? game.player.defaultOffset.x : 0;
    const defaultOffsetY = Number.isFinite(game.player?.defaultOffset?.y) ? game.player.defaultOffset.y : 0;
    cache.forEach((record) => {
        if (!record || !record.label) {
            return;
        }
        const visible =
            Math.abs(record.worldX - camera.rawX) <= threshold &&
            Math.abs(record.worldY - camera.rawY) <= threshold;
        record.label.visible = visible;
        if (visible) {
            const screenX = record.worldX + (defaultOffsetX - camera.rawX);
            const screenY = record.worldY + (defaultOffsetY - camera.rawY) + COMMAND_CENTER_LABEL_OFFSET_Y;
            record.label.x = screenX;
            record.label.y = screenY;
        }
    });
};

const pruneCommandCenterLabels = (game) => {
    if (!game?.commandCenterLabelCache) {
        return;
    }
    const cache = game.commandCenterLabelCache;
    const now = game.tick || Date.now();
    cache.forEach((record, key) => {
        if (!record || !record.label) {
            cache.delete(key);
            return;
        }
        if (!record.label.visible && (record.lastHiddenAt || 0) && (now - record.lastHiddenAt) > 1000) {
            if (record.label.parent) {
                record.label.parent.removeChild(record.label);
            }
            scheduleDestroy(record.label, { minDelay: 16, maxDelay: 200 });
            cache.delete(key);
        } else if (!record.label.visible) {
            record.lastHiddenAt = now;
        } else if (record.lastHiddenAt) {
            record.lastHiddenAt = null;
        }
    });
};

var setRedrawBoundaries = (game) => {
    const centerTileX = game.player.offset.x / TILE_SIZE;
    const centerTileY = game.player.offset.y / TILE_SIZE;
    minTX = centerTileX - REDRAW_RADIUS_TILES;
    maxTX = centerTileX + REDRAW_RADIUS_TILES;
    minTY = centerTileY - REDRAW_RADIUS_TILES;
    maxTY = centerTileY + REDRAW_RADIUS_TILES;
};

var needToRedraw = (game) => {

    if (game.forceDraw) {
        return true;
    }

    const playerTileX = game.player.offset.x / TILE_SIZE;
    const playerTileY = game.player.offset.y / TILE_SIZE;

    if (playerTileX >= maxTX
        || playerTileX <= minTX
        || playerTileY >= maxTY
        || playerTileY <= minTY
    ) {
        return true;
    }
    return false;
};


export const drawTiles = (game, backgroundTiles) => {

    if (!game || !backgroundTiles || !game.map || !game.map.length) {
        return;
    }

    ensureLayers(backgroundTiles);
    syncCommandCenterLabels(game);
    const tileLayer = backgroundTiles.tileLayer;
    const edgeOverlay = backgroundTiles.edgeOverlay;
    if (!tileLayer || !edgeOverlay) {
        return;
    }

    const camera = getCameraPosition(game);
    var offTileX = Math.floor(modulo(camera.pixelX, TILE_SIZE));
    var offTileY = Math.floor(modulo(camera.pixelY, TILE_SIZE));


    if (needToRedraw(game)) {

        setRedrawBoundaries(game);

        tileLayer.clear();
        edgeOverlay.clear();
        edgeOverlay.beginFill(0x000000, 1);

        var exactX = Math.floor(camera.rawX / TILE_SIZE);
        var exactY = Math.floor(camera.rawY / TILE_SIZE);
        var mapWidth = game.map.length;
        var mapHeight = Array.isArray(game.map[0]) ? game.map[0].length : 0;

        for (var i = -VIEW_RADIUS_TILES; i < VIEW_RADIUS_TILES; i++) {
            for (var j = -VIEW_RADIUS_TILES; j < VIEW_RADIUS_TILES; j++) {

                var tileX = exactX + i;
                var tileY = exactY + j;


                if (tileX < 0 || tileY < 0 || tileX >= mapWidth || tileY >= mapHeight) {
                    edgeOverlay.drawRect(i * TILE_SIZE, j * TILE_SIZE, TILE_SIZE, TILE_SIZE);
                    continue;
                }

                if (game.map[tileX][tileY] == MAP_SQUARE_LAVA) {
                    drawLava(game, tileLayer, i, j, tileX, tileY);
                }

                if (game.map[tileX][tileY] == MAP_SQUARE_ROCK) {
                    drawRocks(game, tileLayer, i, j, tileX, tileY);
                }

                if (game.map[tileX][tileY] >= MAP_SQUARE_BUILDING) {
                    drawBuilding(game, tileLayer, i, j, tileX, tileY);
                }
            }
        }
        edgeOverlay.endFill();

        backgroundTiles.position.set(
            game.player.defaultOffset.x + camera.pixelX - offTileX,
            game.player.defaultOffset.y + camera.pixelY - offTileY
        );
    }

    backgroundTiles.pivot.set(camera.pixelX, camera.pixelY);
    updateCommandCenterLabelVisibility(game, camera);
    pruneCommandCenterLabels(game);
};
