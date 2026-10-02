import { Application, Container, Graphics, Sprite, Texture, Text, type TextStyle } from "pixi.js";
import { createDirtyFlagTracker } from "./dirty-flags.js";
import { PANEL_INVENTORY_SLOTS } from "./panel/panel-visuals.js";
import { getFrameTexture, type TextureSet } from "./TextureRegistry.js";

const TANK_SIZE = 22;

type TankPalette = {
    tread: number;
    body: number;
    turret: number;
    barrel: number;
};

export type RenderableEntity = Graphics | Sprite;

const makeTank = (palette: TankPalette): Graphics => {
    const tank = new Graphics();
    const half = TANK_SIZE / 2;
    const treadWidth = 5;
    tank
        .rect(-half - 1, -half, treadWidth, TANK_SIZE)
        .fill(palette.tread)
        .rect(half - treadWidth + 1, -half, treadWidth, TANK_SIZE)
        .fill(palette.tread)
        .rect(-half + treadWidth - 1, -half + 2, TANK_SIZE - (treadWidth * 2) + 2, TANK_SIZE - 4)
        .fill(palette.body)
        .stroke({ color: 0x0f1418, width: 1, alpha: 0.7 })
        .circle(0, 0, 6)
        .fill(palette.turret)
        .stroke({ color: 0x0f1418, width: 1, alpha: 0.8 })
        .roundRect(2, -2, half + 8, 4, 2)
        .fill(palette.barrel);
    return tank;
};

export const resolveTankTexture = (
    textures: TextureSet,
    row: number,
    direction: number
): Texture | null => {
    const column = Math.max(0, Math.min(15, Math.floor((direction % 32) / 2)));
    return getFrameTexture(textures.tanks, `tank:${row}:${column}`, column * 48, row * 48, 48, 48);
};

export const createTankSprite = (textures: TextureSet, row: number, direction: number): RenderableEntity => {
    const texture = resolveTankTexture(textures, row, direction);
    if (!texture) {
        return makeTank({
            tread: 0x2a3a2d,
            body: 0x6ea25f,
            turret: 0x98ce89,
            barrel: 0xc9dec0
        });
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0, 0);
    return sprite;
};

const createHud = (app: Application): { label: Text; panel: Graphics } => {
    const panel = new Graphics();
    panel.position.set(12, 10);
    panel.visible = false;
    app.stage.addChild(panel);

    const hud = new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 13,
            fill: 0xd8ead8,
            stroke: {
                color: 0x101010,
                width: 3,
                join: "round"
            }
        } as TextStyle
    });
    hud.position.set(20, 18);
    hud.visible = false;
    app.stage.addChild(hud);
    return { label: hud, panel };
};

export type SceneLayers = {
    textures: TextureSet;
    world: Container;
    localTank: RenderableEntity;
    remoteLayer: Container;
    remoteTanks: Map<string, RenderableEntity>;
    objectLayer: Container;
    buildingUnderlayLayer: Container;
    researchStripSprites: Map<string, RenderableEntity>;
    buildingSprites: Map<string, RenderableEntity>;
    buildingOverlaySprites: Map<string, RenderableEntity>;
    defenseSprites: Map<string, RenderableEntity>;
    defenseHeadSprites: Map<string, RenderableEntity>;
    hazardSprites: Map<string, RenderableEntity>;
    bulletSprites: Map<string, RenderableEntity>;
    ghostPlacementLayer: Container;
    ghostPlacementFill: Sprite;
    ghostPlacementOverlay: Graphics;
    groundSprite: Graphics;
    tileSprite: Graphics;
    changingSprite: Graphics;
    effectsSprite: Graphics;
    effectExplosionSprites: Map<string, Sprite>;
    effectFloatingPointLabels: Map<string, Text>;
    botDebugSprite: Graphics;
    commandCenterLabelLayer: Container;
    commandCenterLabels: Map<string, Text>;
    labelLayer: Container;
    labels: Map<string, Text>;
    hud: Text;
    hudPanel: Graphics;
    panelBackground: Graphics;
    panelHomeArrow: Sprite;
    panelInventorySelection: Sprite;
    panelInventoryIcons: Map<number, Sprite>;
    panelInventoryCountTexts: Map<number, Text>;
    panelRadar: Graphics;
    panelMessageHeading: Text;
    panelMessageBody: Text;
    panelCashText: Text;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

export const createSceneLayers = (app: Application, textures: TextureSet): SceneLayers => {
    const world = new Container();
    app.stage.addChild(world);

    const groundSprite = new Graphics();
    const tileSprite = new Graphics();
    const objectLayer = new Container();
    const buildingUnderlayLayer = new Container();
    const changingSprite = new Graphics();
    const effectsSprite = new Graphics();
    const botDebugSprite = new Graphics();
    const commandCenterLabelLayer = new Container();

    world.addChild(groundSprite);
    world.addChild(tileSprite);
    world.addChild(objectLayer);
    world.addChild(changingSprite);
    world.addChild(effectsSprite);
    world.addChild(botDebugSprite);
    world.addChild(commandCenterLabelLayer);

    const localTank = createTankSprite(textures, 0, 0);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);

    const labelLayer = new Container();
    world.addChild(labelLayer);

    objectLayer.addChild(buildingUnderlayLayer);

    const ghostPlacementLayer = new Container();
    const ghostPlacementFill = new Sprite(Texture.EMPTY);
    ghostPlacementFill.visible = false;
    const ghostPlacementOverlay = new Graphics();
    ghostPlacementLayer.visible = false;
    ghostPlacementLayer.addChild(ghostPlacementFill);
    ghostPlacementLayer.addChild(ghostPlacementOverlay);
    objectLayer.addChild(ghostPlacementLayer);

    const hudElements = createHud(app);
    const panelBackground = new Graphics();
    const panelHomeArrow = new Sprite();
    panelHomeArrow.visible = false;
    const panelInventorySelection = new Sprite(Texture.EMPTY);
    panelInventorySelection.visible = false;
    const panelInventoryIcons = new Map<number, Sprite>();
    const panelInventoryCountTexts = new Map<number, Text>();
    for (const slot of PANEL_INVENTORY_SLOTS) {
        if (panelInventoryIcons.has(slot.itemType)) {
            continue;
        }
        const iconSprite = new Sprite(Texture.EMPTY);
        iconSprite.visible = false;
        panelInventoryIcons.set(slot.itemType, iconSprite);

        const countText = new Text({
            text: "",
            style: {
                fontFamily: "Arial",
                fontSize: 12,
                fontWeight: "700",
                fill: 0xffffff,
                stroke: {
                    color: 0x000000,
                    width: 3
                }
            } as TextStyle
        });
        countText.visible = false;
        panelInventoryCountTexts.set(slot.itemType, countText);
    }
    const panelRadar = new Graphics();
    const panelMessageHeading = new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 14,
            fontWeight: "700",
            fill: 0xf4d03f,
            stroke: {
                color: 0x000000,
                width: 2
            }
        } as TextStyle
    });
    const panelMessageBody = new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 12,
            fill: 0xfdfefe,
            stroke: {
                color: 0x000000,
                width: 2
            }
        } as TextStyle
    });
    const panelCashText = new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 13,
            fontWeight: "700",
            fill: 0x2ecc71,
            stroke: {
                color: 0x000000,
                width: 1
            }
        } as TextStyle
    });
    app.stage.addChild(panelBackground);
    app.stage.addChild(panelHomeArrow);
    app.stage.addChild(panelInventorySelection);
    for (const iconSprite of panelInventoryIcons.values()) {
        app.stage.addChild(iconSprite);
    }
    for (const countText of panelInventoryCountTexts.values()) {
        app.stage.addChild(countText);
    }
    app.stage.addChild(panelRadar);
    app.stage.addChild(panelMessageHeading);
    app.stage.addChild(panelMessageBody);
    app.stage.addChild(panelCashText);

    return {
        textures,
        world,
        localTank,
        remoteLayer,
        remoteTanks: new Map<string, RenderableEntity>(),
        objectLayer,
        buildingUnderlayLayer,
        researchStripSprites: new Map<string, RenderableEntity>(),
        buildingSprites: new Map<string, RenderableEntity>(),
        buildingOverlaySprites: new Map<string, RenderableEntity>(),
        defenseSprites: new Map<string, RenderableEntity>(),
        defenseHeadSprites: new Map<string, RenderableEntity>(),
        hazardSprites: new Map<string, RenderableEntity>(),
        bulletSprites: new Map<string, RenderableEntity>(),
        ghostPlacementLayer,
        ghostPlacementFill,
        ghostPlacementOverlay,
        groundSprite,
        tileSprite,
        changingSprite,
        effectsSprite,
        effectExplosionSprites: new Map<string, Sprite>(),
        effectFloatingPointLabels: new Map<string, Text>(),
        botDebugSprite,
        commandCenterLabelLayer,
        commandCenterLabels: new Map<string, Text>(),
        labelLayer,
        labels: new Map<string, Text>(),
        hud: hudElements.label,
        hudPanel: hudElements.panel,
        panelBackground,
        panelHomeArrow,
        panelInventorySelection,
        panelInventoryIcons,
        panelInventoryCountTexts,
        panelRadar,
        panelMessageHeading,
        panelMessageBody,
        panelCashText,
        dirty: createDirtyFlagTracker()
    };
};
