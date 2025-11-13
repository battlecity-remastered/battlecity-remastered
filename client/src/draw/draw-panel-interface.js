import PIXI from '../pixi';

import {MAX_HEALTH} from "../constants";
import {ITEM_TYPE_TURRET} from "../constants";
import {ITEM_TYPE_LASER} from "../constants";
import {ITEM_TYPE_MINE} from "../constants";
import {ITEM_TYPE_MEDKIT} from "../constants";
import {ITEM_TYPE_ROCKET} from "../constants";
import {ITEM_TYPE_BOMB} from "../constants";
import {ITEM_TYPE_ORB} from "../constants";
import {ITEM_TYPE_CLOAK} from "../constants";
import {ITEM_TYPE_DFG} from "../constants";
import {ITEM_TYPE_WALL} from "../constants";
import {ITEM_TYPE_SLEEPER} from "../constants";
import {ITEM_TYPE_PLASMA} from "../constants";
import {ITEM_TYPE_FLARE} from "../constants";
import {
    RADAR_RANGE_PX,
    RADAR_RATIO,
    RADAR_CENTER_OFFSET_X,
    RADAR_CENTER_Y,
    RADAR_BOUNDS,
    RADAR_OFFSET_ADJUST_X,
    RADAR_OFFSET_ADJUST_Y
} from "../constants";
import { getOrbAnimationFrame } from '../utils/orbAnimation';

const TILE_SIZE = 48;
const HALF_TILE = TILE_SIZE / 2;
const CITY_CENTER_OFFSET = TILE_SIZE * 1.5;
const PANEL_MESSAGE_STATE_KEY = '__panelMessageState';
const PANEL_HEALTH_STATE_KEY = '__panelHealthState';
const HEALTH_BAR_WIDTH = 38;
const HEALTH_BAR_HEIGHT = 87;

const PANEL_HEADING_STYLE = Object.freeze({
    fontFamily: 'Arial',
    fontSize: 14,
    fontWeight: 'bold',
    fill: 0xF4D03F,
    stroke: 0x000000,
    strokeThickness: 2,
});

const PANEL_BODY_STYLE = Object.freeze({
    fontFamily: 'Arial',
    fontSize: 12,
    fill: 0xFDFEFE,
    stroke: 0x000000,
    strokeThickness: 2,
});

const INVENTORY_SLOTS = {
    [ITEM_TYPE_LASER]: {x: 7, y: 267},
    [ITEM_TYPE_ROCKET]: {x: 42, y: 267},
    [ITEM_TYPE_MEDKIT]: {x: 77, y: 267},
    [ITEM_TYPE_BOMB]: {x: 7, y: 302},
    [ITEM_TYPE_MINE]: {x: 42, y: 302},
    [ITEM_TYPE_ORB]: {x: 77, y: 302},
    [ITEM_TYPE_FLARE]: {x: 7, y: 337},
    [ITEM_TYPE_DFG]: {x: 42, y: 337},
    [ITEM_TYPE_WALL]: {x: 77, y: 337},
    [ITEM_TYPE_TURRET]: {x: 7, y: 372},
    [ITEM_TYPE_SLEEPER]: {x: 42, y: 372},
    [ITEM_TYPE_PLASMA]: {x: 77, y: 372},
    [ITEM_TYPE_CLOAK]: {x: 112, y: 267},
};

const resolveSlotPosition = (type, defaultX, defaultY) => {
    return INVENTORY_SLOTS[type] ?? {x: defaultX, y: defaultY};
};

const PANEL_BUTTON_DEFINITIONS = [
    {
        key: 'staff',
        offsetX: 145,
        y: 268,
        width: 45,
        height: 20,
        handler: (game) => game?.showStaffSummary && game.showStaffSummary()
    },
    {
        key: 'map',
        offsetX: 145,
        y: 290,
        width: 45,
        height: 20,
        handler: (game) => game?.toggleMapOverlay && game.toggleMapOverlay()
    },
    {
        key: 'info',
        offsetX: 145,
        y: 312,
        width: 45,
        height: 20,
        handler: (game) => game?.showPlayerCityInfo && game.showPlayerCityInfo()
    },
    {
        key: 'points',
        offsetX: 145,
        y: 334,
        width: 45,
        height: 20,
        handler: (game) => game?.showPointsSummary && game.showPointsSummary()
    },
    {
        key: 'options',
        offsetX: 145,
        y: 356,
        width: 45,
        height: 20,
        handler: (game) => game?.openOptionsPanel && game.openOptionsPanel()
    },
    {
        key: 'help',
        offsetX: 145,
        y: 378,
        width: 45,
        height: 20,
        handler: (game) => game?.showHelpMessage && game.showHelpMessage()
    },
    {
        key: 'build',
        offsetX: 126,
        y: 400,
        width: 64,
        height: 22,
        handler: (game) => game?.toggleBuildMenuFromPanel && game.toggleBuildMenuFromPanel()
    },
    {
        key: 'exit',
        offsetX: 150,
        y: 576,
        width: 42,
        height: 18,
        handler: (game) => game?.requestExitToLobby && game.requestExitToLobby()
    }
];

const attachPanelButtons = (game, stage) => {
    if (!game || !stage) {
        return;
    }
    const baseX = game.maxMapX || 0;
    PANEL_BUTTON_DEFINITIONS.forEach((definition) => {
        const graphics = new PIXI.Graphics();
        graphics.beginFill(0xffffff, 0.001);
        graphics.drawRect(baseX + definition.offsetX, definition.y, definition.width, definition.height);
        graphics.endFill();
        graphics.interactive = true;
        graphics.buttonMode = true;
        graphics.cursor = 'pointer';
        graphics.on('pointertap', (event) => {
            event.stopPropagation();
            if (typeof definition.handler === 'function') {
                definition.handler(game);
            }
        });
        stage.addChild(graphics);
    });
};

const formatCash = (value) => {
    const amount = Number.isFinite(value) ? value : parseInt(value, 10) || 0;
    try {
        return amount.toLocaleString('en-US');
    } catch (_error) {
        return `${amount}`;
    }
};

const getGrossIncome = (city) => {
    if (!city) {
        return 0;
    }
    if (typeof city.grossIncome === 'number' && Number.isFinite(city.grossIncome)) {
        return city.grossIncome;
    }
    const income = Number(city.income || 0);
    const expenses = Number(city.itemProduction || 0) + Number(city.research || 0) + Number(city.hospital || 0) + Number(city.construction || 0);
    return income - expenses;
};

const RADAR_STATE_KEY = '__radarState';
const RADAR_SPRITE_SCALE = 2;
const RADAR_TEXTURE_SIZE = 2;

const HOME_ARROW_STATE_KEY = '__homeArrowState';
const HOME_ARROW_FRAME_SIZE = 40;
const HOME_ARROW_OFFSET_X = 5;
const HOME_ARROW_OFFSET_Y = 160;

const toFiniteNumber = (value, fallback = null) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return fallback;
};

const createTextureSlice = (texture, column) => {
    if (!texture || !texture.baseTexture) {
        return null;
    }
    return new PIXI.Texture(texture.baseTexture, new PIXI.Rectangle(column * RADAR_TEXTURE_SIZE, 0, RADAR_TEXTURE_SIZE, RADAR_TEXTURE_SIZE));
};

const buildRadarTextures = (game) => {
    if (!game || !game.textures) {
        return null;
    }
    const base = game.textures.imgRadarColors;
    if (!base) {
        return null;
    }
    const textures = {
        neutral: createTextureSlice(base, 0),
        admin: createTextureSlice(base, 1),
        enemy: createTextureSlice(base, 2),
        ally: createTextureSlice(base, 3),
    };
    const mini = game.textures.imgMiniMapColors;
    if (mini && mini.baseTexture) {
        textures.dead = new PIXI.Texture(mini.baseTexture, new PIXI.Rectangle(15 * RADAR_TEXTURE_SIZE, 0, RADAR_TEXTURE_SIZE, RADAR_TEXTURE_SIZE));
    }
    return textures;
};

const ensurePanelMessageState = (game) => {
    if (!game) {
        return null;
    }
    if (!game[PANEL_MESSAGE_STATE_KEY]) {
        game[PANEL_MESSAGE_STATE_KEY] = {
            heading: null,
            lines: []
        };
    }
    return game[PANEL_MESSAGE_STATE_KEY];
};

const ensureHealthSpriteState = (game) => {
    if (!game) {
        return null;
    }
    if (!game[PANEL_HEALTH_STATE_KEY]) {
        const baseTexture = game.textures?.health?.baseTexture;
        if (!baseTexture) {
            return null;
        }
        const texture = new PIXI.Texture(baseTexture);
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(1, 1);
        game[PANEL_HEALTH_STATE_KEY] = {
            sprite,
            texture
        };
    }
    return game[PANEL_HEALTH_STATE_KEY];
};

const buildHomeArrowTextures = (game) => {
    const texture = game?.textures?.imgArrows;
    if (!texture || !texture.baseTexture) {
        return [];
    }
    const frames = [];
    for (let i = 0; i < 8; i += 1) {
        const rect = new PIXI.Rectangle(i * HOME_ARROW_FRAME_SIZE, 0, HOME_ARROW_FRAME_SIZE, HOME_ARROW_FRAME_SIZE);
        frames.push(new PIXI.Texture(texture.baseTexture, rect));
    }
    return frames;
};

const ensureHomeArrowState = (game, stage) => {
    if (!game || !stage || !game.textures?.imgArrows) {
        return null;
    }

    let state = stage[HOME_ARROW_STATE_KEY];
    if (!state) {
        const textures = buildHomeArrowTextures(game);
        if (!textures.length) {
            return null;
        }
        const container = new PIXI.Container();
        container.name = 'home-arrow';
        container.position.set((game.maxMapX || 0) + HOME_ARROW_OFFSET_X, HOME_ARROW_OFFSET_Y);
        const sprite = new PIXI.Sprite(textures[0]);
        container.addChild(sprite);
        stage.addChild(container);
        state = {
            container,
            sprite,
            textures,
            lastIndex: -1
        };
        stage[HOME_ARROW_STATE_KEY] = state;
        return state;
    }

    if (!state.container.parent || state.container.parent !== stage) {
        stage.addChild(state.container);
    }

    if (!Array.isArray(state.textures) || state.textures.length !== 8) {
        state.textures = buildHomeArrowTextures(game);
        if (state.sprite && state.textures.length) {
            state.sprite.texture = state.textures[0];
            state.lastIndex = -1;
        }
    }

    return state;
};

const updateHomeArrow = (game, stage) => {
    const state = ensureHomeArrowState(game, stage);
    if (!state || !state.sprite) {
        return;
    }

    const container = state.container;
    container.position.set((game.maxMapX || 0) + HOME_ARROW_OFFSET_X, HOME_ARROW_OFFSET_Y);

    const player = game?.player;
    const playerOffset = player?.offset;
    const playerCityId = toFiniteNumber(player?.city, null);

    if (!playerOffset || playerCityId === null) {
        container.visible = false;
        return;
    }

    const city = game.cities?.[playerCityId];
    if (!city) {
        container.visible = false;
        return;
    }

    const cityX = toFiniteNumber(city.x, null);
    const cityY = toFiniteNumber(city.y, null);
    const playerX = toFiniteNumber(playerOffset.x, null);
    const playerY = toFiniteNumber(playerOffset.y, null);

    if (!Number.isFinite(cityX) || !Number.isFinite(cityY) || !Number.isFinite(playerX) || !Number.isFinite(playerY)) {
        container.visible = false;
        return;
    }

    const cityCenterX = cityX + CITY_CENTER_OFFSET;
    const cityCenterY = cityY + CITY_CENTER_OFFSET;
    const playerCenterX = playerX + HALF_TILE;
    const playerCenterY = playerY + HALF_TILE;

    const dx = cityCenterX - playerCenterX;
    const dy = cityCenterY - playerCenterY;

    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        container.visible = false;
        return;
    }

    const angle = Math.atan2(-dy, dx);
    let index = Math.round(angle / (Math.PI / 4));
    index = ((index % 8) + 8) % 8;

    const textures = state.textures;
    if (!textures || !textures[index]) {
        container.visible = false;
        return;
    }

    if (state.lastIndex !== index) {
        state.sprite.texture = textures[index];
        state.lastIndex = index;
    }

    container.visible = true;
};

const ensureRadarState = (game, stage) => {
    if (!game || !stage || !game.textures || !game.textures.imgRadarColors) {
        return null;
    }

    let state = stage[RADAR_STATE_KEY];
    if (!state) {
        const container = new PIXI.Container();
        container.name = 'radar-container';
        const pointsLayer = new PIXI.Container();
        pointsLayer.name = 'radar-points';
        container.addChild(pointsLayer);
        state = {
            container,
            pointsLayer,
            pool: [],
            spriteScale: RADAR_SPRITE_SCALE,
            textures: null,
            bounds: null,
        };
        stage[RADAR_STATE_KEY] = state;
    }

    if (!state.textures) {
        state.textures = buildRadarTextures(game);
    }
    if (!state.textures) {
        return null;
    }

    const panelLeft = game.maxMapX || 0;
    const { offsetX, offsetY, width, height } = RADAR_BOUNDS;
    const left = panelLeft + offsetX;
    const top = offsetY;
    state.bounds = {
        left,
        top,
        right: left + width,
        bottom: top + height,
        width,
        height,
    };
    state.container.position.set(left, top);

    if (!state.container.parent || state.container.parent !== stage) {
        stage.addChild(state.container);
    }

    return state;
};

const updateRadar = (game, radarState) => {
    if (!game || !radarState || !radarState.pointsLayer || !radarState.textures) {
        return;
    }

    const me = game.player;
    if (!me || !me.offset) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const myX = toFiniteNumber(me.offset.x, null);
    const myY = toFiniteNumber(me.offset.y, null);
    if (!Number.isFinite(myX) || !Number.isFinite(myY)) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const bounds = radarState.bounds;
    if (!bounds) {
        radarState.pointsLayer.visible = false;
        return;
    }

    const pool = radarState.pool;
    const textures = radarState.textures;
    const baseX = (game.maxMapX || 0) + RADAR_CENTER_OFFSET_X;
    const baseY = RADAR_CENTER_Y;
    const range = RADAR_RANGE_PX;
    const myCity = toFiniteNumber(me.city, null);
    const hasMyCity = Number.isFinite(myCity);
    let usedCount = 0;

    const acquireSprite = (texture, posX, posY) => {
        let sprite = pool[usedCount];
        if (!sprite) {
            sprite = new PIXI.Sprite(texture);
            sprite.anchor.set(0.5);
            sprite.scale.set(radarState.spriteScale, radarState.spriteScale);
            radarState.pointsLayer.addChild(sprite);
            pool[usedCount] = sprite;
        }
        if (sprite.texture !== texture) {
            sprite.texture = texture;
        }
        sprite.visible = true;
        sprite.position.set(posX - bounds.left, posY - bounds.top);
        usedCount += 1;
    };

    const tryPlot = (offsetX, offsetY, cityId, health, isSelf, isAdmin, radarType) => {
        const dx = offsetX - myX;
        const dy = offsetY - myY;
        if (Math.abs(dx) > range || Math.abs(dy) > range) {
            return;
        }
        const globalX = baseX + ((dx - RADAR_OFFSET_ADJUST_X) / RADAR_RATIO);
        const globalY = baseY + ((dy - RADAR_OFFSET_ADJUST_Y) / RADAR_RATIO);
        if (globalX < bounds.left || globalX > bounds.right || globalY < bounds.top || globalY > bounds.bottom) {
            return;
        }

        let texture = textures.enemy;
        if (radarType !== 'rogue') {
            const numericCity = Number.isFinite(cityId) ? cityId : null;
            const sameCity = hasMyCity && numericCity !== null && numericCity === myCity;
            if (isSelf || sameCity) {
                texture = textures.ally || textures.neutral || texture;
            } else if (isAdmin && textures.admin) {
                texture = textures.admin;
            } else if (numericCity === null && textures.neutral) {
                texture = textures.neutral;
            }
        }

        if (Number.isFinite(health) && health <= 0 && textures.dead) {
            texture = textures.dead;
        }
        if (!texture) {
            return;
        }

        acquireSprite(texture, globalX, globalY);
    };

    if (!me.isCloaked) {
        tryPlot(
            myX,
            myY,
            myCity,
            toFiniteNumber(me.health, null),
            true,
            false,
            'player'
        );
    }

    const others = game.otherPlayers;
    if (others) {
        for (const key in others) {
            if (!Object.prototype.hasOwnProperty.call(others, key)) {
                continue;
            }
            const other = others[key];
            if (!other || !other.offset || other.isCloaked) {
                continue;
            }
            const otherX = toFiniteNumber(other.offset.x, null);
            const otherY = toFiniteNumber(other.offset.y, null);
            if (!Number.isFinite(otherX) || !Number.isFinite(otherY)) {
                continue;
            }
            tryPlot(
                otherX,
                otherY,
                toFiniteNumber(other.city, null),
                toFiniteNumber(other.health, null),
                false,
                !!other.isAdmin,
                'player'
            );
        }
    }

    const rogueManager = game.rogueTankManager;
    if (rogueManager && Array.isArray(rogueManager.tanks)) {
        const tanks = rogueManager.tanks;
        for (let i = 0; i < tanks.length; i += 1) {
            const tank = tanks[i];
            if (!tank || !tank.offset) {
                continue;
            }
            const rogueX = toFiniteNumber(tank.offset.x, null);
            const rogueY = toFiniteNumber(tank.offset.y, null);
            if (!Number.isFinite(rogueX) || !Number.isFinite(rogueY)) {
                continue;
            }
            tryPlot(
                rogueX,
                rogueY,
                null,
                toFiniteNumber(tank.health, null),
                false,
                false,
                'rogue'
            );
        }
    }

    for (let i = usedCount; i < pool.length; i += 1) {
        const sprite = pool[i];
        if (sprite) {
            sprite.visible = false;
        }
    }

    radarState.pointsLayer.visible = usedCount > 0;
};

var drawPanel = (game, stage) => {
    var interfaceTop = new PIXI.Sprite(game.textures["interfaceTop"]);
    interfaceTop.x = game.maxMapX;
    interfaceTop.y = 0;
    stage.addChild(interfaceTop);

    var interfaceBottom = new PIXI.Sprite(game.textures["interfaceBottom"]);
    interfaceBottom.x = game.maxMapX;
    interfaceBottom.y = 430;
    stage.addChild(interfaceBottom);
};

var drawFinance = (game, stage) => {
    if (!game.player.isMayor) {
        return;
    }
    const cityIndex = game.player.city ?? 0;
    const city = game.cities?.[cityIndex];
    if (!city) {
        return;
    }

    const boxTexture = game.textures['imgMoneyBox'];
    if (boxTexture) {
        const moneyBox = new PIXI.Sprite(boxTexture);
        moneyBox.x = game.maxMapX + 2;
        moneyBox.y = 224;
        stage.addChild(moneyBox);
    }

    const gross = getGrossIncome(city);
    const iconKey = gross < 0 ? 'imgMoneyDown' : 'imgMoneyUp';
    const iconTexture = game.textures[iconKey];
    if (iconTexture) {
        const indicator = new PIXI.Sprite(iconTexture);
        indicator.x = game.maxMapX + 8;
        indicator.y = 225;
        stage.addChild(indicator);
    }

    const cashText = new PIXI.Text(formatCash(city.cash ?? 0), {
        fontFamily: 'Arial',
        fontSize: 13,
        fontWeight: 'bold',
        fill: gross < 0 ? 0xE74C3C : 0x2ECC71,
        stroke: 0x000000,
        strokeThickness: 1,
    });
    cashText.x = game.maxMapX + 24;
    cashText.y = 226;
    stage.addChild(cashText);

    // The finance panel previously surfaced score and orb totals alongside the inventory slots,
    // but these numbers cluttered the interface and duplicated information that is available in
    // other dedicated views.  Drop the text nodes entirely so the inventory grid focuses solely
    // on item icons.
};

var drawItems = (game, stage) => {
    var icon = game.iconFactory.getHead();


    var x = 0;
    var y = 0;
    while (icon) {

        if (icon.owner == game.player.id) {


            let frameX = icon.type * 32;
            let frameY = 0;
            if (icon.type === ITEM_TYPE_ORB) {
                const frame = getOrbAnimationFrame(game);
                frameX = 250;
                frameY = 41 + (frame * 48);
            } else if (icon.type === ITEM_TYPE_BOMB && icon.armed) {
                frameX = 152;
                frameY = 89;
            }

            var tmpText = new PIXI.Texture(
                game.textures['imageItems'].baseTexture,
                new PIXI.Rectangle(frameX, frameY, 32, 32)
            );

            var iconSprite = new PIXI.Sprite(tmpText);


            const slot = resolveSlotPosition(icon.type, 7, 267);
            x = game.maxMapX + slot.x;
            y = slot.y;

            if (icon.selected) {
                var selected = new PIXI.Sprite(game.textures['imageInventorySelection']);
                selected.x = x;
                selected.y = y;
                stage.addChild(selected);
            }

            iconSprite.x = x + (icon.type === ITEM_TYPE_ORB ? 2 : 0);
            iconSprite.y = y;

            iconSprite.interactive = true;
            iconSprite.buttonMode = true;

            const iconClosure = icon;
            iconSprite.on('mousedown', (event) => {
                console.log("selecting item")
                event.stopPropagation();
                console.log("selecting item")
                game.iconFactory.toggleSelected(iconClosure);
                game.forceDraw = true;
            });
            stage.addChild(iconSprite);

            if (icon.type === ITEM_TYPE_ORB) {
                iconSprite.__isOrbPanelIcon = true;
                iconSprite.__orbBaseX = 250;
                iconSprite.__orbBaseY = 41;
                iconSprite.__orbFrameWidth = 32;
                iconSprite.__orbFrameHeight = 32;
                iconSprite.__orbFrameSpacing = 48;
            }

            const quantity = icon.quantity ?? 1;
            if (quantity > 1) {
                const qtyText = new PIXI.Text(`${quantity}`, {
                    fontFamily: 'Arial',
                    fontSize: 12,
                    fill: 0xFFFFFF,
                    fontWeight: 'bold',
                    stroke: 0x000000,
                    strokeThickness: 3,
                });
                qtyText.x = x + 22;
                qtyText.y = y + 12;
                stage.addChild(qtyText);
            }

        }
        icon = icon.next;
    }
};

const drawPanelMessages = (game, stage) => {
    if (!game || !stage) {
        return;
    }
    const panelState = game.panelState || {};
    const heading = panelState.heading || '';
    const lines = Array.isArray(panelState.lines) ? panelState.lines : [];

    if (!heading && !lines.length) {
        return;
    }

    const baseX = game.maxMapX + 12;
    let currentY = 465;

    const state = ensurePanelMessageState(game);
    const headingSprite = (() => {
        if (!state) {
            return null;
        }
        if (!state.heading) {
            state.heading = new PIXI.Text('', PANEL_HEADING_STYLE);
        }
        return state.heading;
    })();

    if (headingSprite) {
        if (heading) {
            headingSprite.visible = true;
            headingSprite.text = heading;
            headingSprite.x = baseX;
            headingSprite.y = currentY;
            stage.addChild(headingSprite);
            currentY += 15;
        } else {
            headingSprite.visible = false;
        }
    }

    const lineSprites = state ? state.lines : [];
    let lineIndex = 0;
    lines.forEach((line) => {
        if (line === null || line === undefined || line === '') {
            currentY += 15;
            if (lineSprites[lineIndex]) {
                lineSprites[lineIndex].visible = false;
            }
            lineIndex += 1;
            return;
        }
        let textSprite = lineSprites[lineIndex];
        if (!textSprite) {
            textSprite = new PIXI.Text('', PANEL_BODY_STYLE);
            lineSprites[lineIndex] = textSprite;
        }
        textSprite.visible = true;
        textSprite.text = `${line}`;
        textSprite.x = baseX;
        textSprite.y = currentY;
        stage.addChild(textSprite);
        currentY += 15;
        lineIndex += 1;
    });

    if (lineSprites) {
        for (let i = lineIndex; i < lineSprites.length; i += 1) {
            if (lineSprites[i]) {
                lineSprites[i].visible = false;
            }
        }
    }
};

const updateOrbPanelIcons = (game, container) => {
    if (!game || !container) {
        return;
    }
    const frame = getOrbAnimationFrame(game);
    const visit = (node) => {
        if (!node) {
            return;
        }
        if (node.__isOrbPanelIcon && node.texture) {
            const nextY = (node.__orbBaseY ?? 41) + (frame * (node.__orbFrameSpacing ?? 48));
            const nextX = node.__orbBaseX ?? 250;
            const width = node.__orbFrameWidth ?? 32;
            const height = node.__orbFrameHeight ?? 32;
            const texture = node.texture;
            const currentFrame = texture.frame;
            const needsUpdate = !currentFrame ||
                currentFrame.x !== nextX ||
                currentFrame.y !== nextY ||
                currentFrame.width !== width ||
                currentFrame.height !== height;
            if (needsUpdate) {
                texture.frame = new PIXI.Rectangle(nextX, nextY, width, height);
                texture.updateUvs();
            }
        }
        if (node.children && node.children.length) {
            node.children.forEach(visit);
        }
    };
    visit(container);
};

var drawHealth = (game, stage) => {

    const percent = Math.max(0, Math.min(1, game.player.health / MAX_HEALTH));
    const height = Math.floor(percent * HEALTH_BAR_HEIGHT);
    const state = ensureHealthSpriteState(game);
    if (!state) {
        return;
    }
    const { sprite, texture } = state;
    if (!sprite || !texture) {
        return;
    }
    const needsUpdate = texture.frame.height !== height;
    if (needsUpdate) {
        texture.frame = new PIXI.Rectangle(0, 0, HEALTH_BAR_WIDTH, height);
        texture.updateUvs();
    }
    sprite.visible = height > 0;
    sprite.x = game.maxMapX + (137 + HEALTH_BAR_WIDTH);
    sprite.y = 160 + HEALTH_BAR_HEIGHT;
    if (!sprite.parent) {
        stage.addChild(sprite);
    } else if (sprite.parent !== stage) {
        sprite.parent.removeChild(sprite);
        stage.addChild(sprite);
    }
};


export const drawPanelInterface = (game, panelContainer) => {

    if (game.forceDraw) {
        panelContainer.removeChildren();
        drawPanel(game, panelContainer);
        drawFinance(game, panelContainer);
        drawHealth(game, panelContainer);
        drawItems(game, panelContainer);
        drawPanelMessages(game, panelContainer);
        attachPanelButtons(game, panelContainer);
    }

    const radarState = ensureRadarState(game, panelContainer);
    updateRadar(game, radarState);
    updateHomeArrow(game, panelContainer);
    updateOrbPanelIcons(game, panelContainer);
};
