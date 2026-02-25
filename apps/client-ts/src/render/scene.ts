import { Application, Container, Graphics, Sprite, Texture, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { reconcileEntityCache } from "./entity-cache.js";
import { resolveGhostPlacement } from "../ui/build-menu/GhostPlacement.js";
import { createDirtyFlagTracker } from "./dirty-flags.js";
import { renderHazardItems } from "./items/ItemRenderer.js";
import { renderGroundLayer } from "./layers/GroundLayer.js";
import { renderTileLayer } from "./layers/TileLayer.js";
import { renderChangingLayer } from "./layers/ChangingLayer.js";
import { isCommandCenterType, resolveResearchStripPlacement } from "./layers/changing-layer-helpers.js";
import { renderNameLabels } from "./labels/NameLabelRenderer.js";
import { renderEffects } from "./effects/EffectsRenderer.js";
import { renderBotDebugLayer } from "./debug/BotDebugLayer.js";
import { formatNearestOrbableCityLine, resolveNearestOrbableCity } from "./orb-target.js";
import { loadMapData, type LoadedMap } from "../world/map-loader.js";
import { getFrameTexture, loadLegacyTextures, type LegacyTextures } from "./LegacyTextureRegistry.js";
import {
    resolveBuildingAnimationFrameX,
    resolveBuildingBaseFrame,
    resolveBuildingOverlay
} from "./layers/building-parity-helpers.js";
import { resolveBulletFrameRect } from "./items/item-parity-helpers.js";
import {
    HOME_ARROW,
    isPanelButtonActive,
    PANEL_FINANCE,
    PANEL_HEALTH,
    PANEL_INVENTORY_SLOTS,
    PANEL_MESSAGE,
    PANEL_TOP_Y,
    PANEL_TOP_HEIGHT,
    PANEL_BOTTOM_Y,
    PANEL_BOTTOM_HEIGHT,
    PANEL_BUTTONS,
    projectRadarPoint,
    RADAR_BOUNDS,
    resolveHealthMaskRect,
    resolveHomeArrowFrame
} from "./panel/panel-visuals.js";
import { resolveViewportFromState } from "../gameplay/world-viewport.js";
import {
    PANEL,
    ITEM_TYPE_BOMB,
    ITEM_TYPE_ORB,
    TILE
} from "./parity/constants.js";
import { resolveDefenseDamageColumn } from "./parity/defense-damage.js";
import { resolveVisibleDefenseIds } from "./parity/defense-visibility.js";
import { resolveCitySpawn, getCityDisplayName } from "../world/city-spawn.js";
import { recordDebugRenderTick } from "../app/debug-metrics.js";

const TANK_SIZE = 22;
const COMMAND_CENTER_LABEL_OFFSET_Y = -32;
const COMMAND_CENTER_LABEL_VIEW_THRESHOLD = 40 * TILE;
const COMMAND_CENTER_LABEL_RESOLUTION = 2;

type TankPalette = {
    tread: number;
    body: number;
    turret: number;
    barrel: number;
};

type RenderableEntity = Graphics | Sprite;
type CacheEntity = Graphics | Sprite | Text;
const RESEARCH_BUILDING_FAMILY = 4;

const isResearchBuildingType = (buildingType: number): boolean => {
    return Math.floor(buildingType / 100) === RESEARCH_BUILDING_FAMILY;
};

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

const syncEntityCache = <T extends CacheEntity>(
    cache: Map<string, T>,
    layer: Container,
    ids: Iterable<string>,
    create: () => T
): void => {
    reconcileEntityCache(
        cache,
        ids,
        () => {
            const entity = create();
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

const resolveLocalRole = (state: ClientState): "mayor" | "recruit" => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === state.local.city);
    return assignment?.mayorId === state.local.id ? "mayor" : "recruit";
};

const resolveRemoteRole = (state: ClientState, remoteId: string): "mayor" | "recruit" => {
    const assignment = state.lobby.assignments.find((entry) => entry.mayorId === remoteId);
    return assignment ? "mayor" : "recruit";
};

const formatCash = (value: number): string => {
    const amount = Number.isFinite(value) ? Math.floor(value) : 0;
    try {
        return amount.toLocaleString("en-US");
    } catch {
        return `${amount}`;
    }
};

const ORB_PANEL_FRAME_COUNT = 3;
const ORB_PANEL_FRAME_INTERVAL_MS = 200;

const resolvePanelItemFrameRect = (
    itemType: number,
    nowMs: number,
    bombArmed: boolean
): { x: number; y: number; width: number; height: number } => {
    if (itemType === ITEM_TYPE_ORB) {
        const frame = Math.floor((nowMs % (ORB_PANEL_FRAME_COUNT * ORB_PANEL_FRAME_INTERVAL_MS)) / ORB_PANEL_FRAME_INTERVAL_MS);
        return {
            x: 250,
            y: 41 + (Math.max(0, Math.min(ORB_PANEL_FRAME_COUNT - 1, frame)) * 48),
            width: 32,
            height: 32
        };
    }
    if (itemType === ITEM_TYPE_BOMB && bombArmed) {
        return {
            x: 152,
            y: 89,
            width: 32,
            height: 32
        };
    }
    return {
        x: itemType * 32,
        y: 0,
        width: 32,
        height: 32
    };
};

const resolveTankTexture = (
    textures: LegacyTextures,
    row: number,
    direction: number
): Texture | null => {
    const column = Math.max(0, Math.min(15, Math.floor((direction % 32) / 2)));
    return getFrameTexture(textures.tanks, `tank:${row}:${column}`, column * 48, row * 48, 48, 48);
};

const createTankSprite = (textures: LegacyTextures, row: number, direction: number): RenderableEntity => {
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

const attachCanvasToRoot = (app: Application): void => {
    const root = document.getElementById("app");
    if (root) {
        root.appendChild(app.canvas);
    }
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
        }
    });
    hud.position.set(20, 18);
    hud.visible = false;
    app.stage.addChild(hud);
    return { label: hud, panel };
};

type SceneLayers = {
    textures: LegacyTextures;
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

const createSceneLayers = (app: Application, textures: LegacyTextures): SceneLayers => {
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
            }
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
        }
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
        }
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
        }
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

const updateTankEntityTexture = (
    entity: RenderableEntity,
    textures: LegacyTextures,
    row: number,
    direction: number
): void => {
    if (!(entity instanceof Sprite)) {
        return;
    }
    const texture = resolveTankTexture(textures, row, direction);
    if (!texture) {
        return;
    }
    entity.texture = texture;
};

const renderGhostPlacement = (state: ClientState, layers: SceneLayers): void => {
    const layer = layers.ghostPlacementLayer;
    const fill = layers.ghostPlacementFill;
    const overlay = layers.ghostPlacementOverlay;
    const ghostPlacement = resolveGhostPlacement(state);
    if (!ghostPlacement) {
        layer.visible = false;
        fill.visible = false;
        overlay.clear();
        return;
    }

    layer.visible = true;
    overlay.clear();
    const baseFrame = resolveBuildingBaseFrame(ghostPlacement.buildType);
    const texture = getFrameTexture(
        layers.textures.buildings,
        `ghost:${ghostPlacement.buildType}`,
        baseFrame.x,
        baseFrame.y,
        baseFrame.width,
        baseFrame.height
    );
    if (texture) {
        fill.texture = texture;
        fill.visible = true;
        fill.alpha = 0.52;
        fill.position.set(0, 0);
        fill.width = TILE * 3;
        fill.height = TILE * 3;
    } else {
        fill.visible = false;
    }
    overlay
        .rect(0, 0, TILE * 3, TILE * 3)
        .fill({ color: ghostPlacement.blocked ? 0xff5a6f : 0x4ae18f, alpha: texture ? 0.16 : 0.3 })
        .stroke({ color: ghostPlacement.blocked ? 0xffa7b1 : 0xc2ffd6, alpha: 0.9, width: 2 });
    layer.position.set(ghostPlacement.tileX * TILE, ghostPlacement.tileY * TILE);
};

const resolveBuildingTexture = (
    textures: LegacyTextures,
    buildingType: number,
    animateFrameCounter: number | null
): Texture | null => {
    const baseFrame = resolveBuildingBaseFrame(buildingType);
    const frameX = animateFrameCounter === null ? baseFrame.x : resolveBuildingAnimationFrameX(animateFrameCounter);
    return getFrameTexture(
        textures.buildings,
        `building:${buildingType}:${frameX}`,
        frameX,
        baseFrame.y,
        baseFrame.width,
        baseFrame.height
    );
};

const resolveDefenseTexture = (
    textures: LegacyTextures,
    defenseType: number,
    health: number,
    maxHealth: number
): Texture | null => {
    const typeRow = Math.max(0, Math.min(2, defenseType - 9));
    const damageColumn = resolveDefenseDamageColumn(defenseType, health, maxHealth);
    return getFrameTexture(
        textures.turretBase,
        `defense:${typeRow}:${damageColumn}`,
        damageColumn * 48,
        typeRow * 48,
        48,
        48
    );
};

const resolveDefenseHeadTexture = (textures: LegacyTextures, defenseType: number, orientation: number): Texture | null => {
    const row = Math.max(0, Math.min(2, defenseType - 9));
    const heading = ((Math.floor(orientation) % 32) + 32) % 32;
    const frame = Math.max(0, Math.min(15, Math.floor(heading / 2)));
    return getFrameTexture(textures.turretHead, `defense-head:${row}:${frame}`, frame * 48, row * 48, 48, 48);
};

const resolveBulletSprite = (textures: LegacyTextures): Sprite | null => {
    const texture = getFrameTexture(textures.bullets, "bullet:default", 0, 0, 8, 8);
    if (!texture) {
        return null;
    }
    const sprite = new Sprite(texture);
    sprite.anchor.set(0, 0);
    return sprite;
};

const resolveResearchStripTexture = (
    state: ClientState,
    textures: LegacyTextures,
    buildingId: string,
    buildingType: number,
    cityId: number
): Texture | null => {
    const cityResearch = state.research.get(cityId);
    const isComplete = cityResearch?.completed.includes(buildingType) ?? false;
    const source = isComplete ? textures.researchComplete : textures.research;
    if (!source) {
        return null;
    }
    return getFrameTexture(
        source,
        `research-strip:${buildingId}:${isComplete ? "complete" : "pending"}`,
        0,
        5,
        10,
        134
    );
};

const resolveResearchStripBuildingIds = (state: ClientState): string[] => {
    const ids: string[] = [];
    for (const building of state.buildings.values()) {
        if (isResearchBuildingType(building.type)) {
            ids.push(building.id);
        }
    }
    return ids;
};

const syncResearchStripSprites = (
    state: ClientState,
    layers: SceneLayers,
    researchStripBuildingIds: string[]
): void => {
    syncEntityCache(layers.researchStripSprites, layers.buildingUnderlayLayer, researchStripBuildingIds, () => new Sprite());
    for (const buildingId of researchStripBuildingIds) {
        const building = state.buildings.get(buildingId);
        const sprite = layers.researchStripSprites.get(buildingId);
        if (!building || !(sprite instanceof Sprite)) {
            continue;
        }
        const frame = resolveResearchStripTexture(
            state,
            layers.textures,
            building.id,
            building.type,
            building.cityId
        );
        if (!frame) {
            sprite.visible = false;
            continue;
        }
        const placement = resolveResearchStripPlacement(building.tileX, building.tileY);
        sprite.texture = frame;
        sprite.position.set(placement.x, placement.y);
        sprite.width = placement.width;
        sprite.height = placement.height;
        sprite.alpha = 0.95;
        sprite.visible = true;
    }
};

const createFallbackBuildingEntity = (): Graphics => {
    const entity = new Graphics();
    entity.roundRect(0, 0, TILE * 3, TILE * 3, 3).fill(0x8e7a56);
    return entity;
};

const createCommandCenterLabel = (): Text => {
    const label = new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 14,
            fontWeight: "bold",
            fill: 0xf2f6ff,
            align: "center",
            stroke: {
                color: 0x000000,
                width: 4
            },
            lineHeight: 16,
            wordWrap: true,
            wordWrapWidth: 120
        }
    });
    label.anchor.set(0.5);
    label.resolution = COMMAND_CENTER_LABEL_RESOLUTION;
    return label;
};

const resolveCommandCenterBuildingIds = (state: ClientState): string[] => {
    const ids: string[] = [];
    for (const building of state.buildings.values()) {
        if (isCommandCenterType(building.type)) {
            ids.push(building.id);
        }
    }
    return ids;
};

const syncCommandCenterLabels = (state: ClientState, layers: SceneLayers): void => {
    const commandCenterIds = resolveCommandCenterBuildingIds(state);
    syncEntityCache(layers.commandCenterLabels, layers.commandCenterLabelLayer, commandCenterIds, createCommandCenterLabel);
    for (const buildingId of commandCenterIds) {
        const building = state.buildings.get(buildingId);
        const label = layers.commandCenterLabels.get(buildingId);
        if (!building || !label) {
            continue;
        }
        const cityName = getCityDisplayName(building.cityId);
        if (label.text !== cityName) {
            label.text = cityName;
        }
        const centerX = (building.tileX + 1.5) * TILE;
        const centerY = (building.tileY + 1.5) * TILE;
        const visible = Math.abs(centerX - state.local.x) <= COMMAND_CENTER_LABEL_VIEW_THRESHOLD
            && Math.abs(centerY - state.local.y) <= COMMAND_CENTER_LABEL_VIEW_THRESHOLD;
        label.visible = visible;
        if (visible) {
            label.position.set(centerX, centerY + COMMAND_CENTER_LABEL_OFFSET_Y);
        }
    }
};

const createBuildingEntity = (layers: SceneLayers, state: ClientState): Sprite | Graphics => {
    const firstBuilding = state.buildings.values().next().value;
    if (!firstBuilding) {
        return createFallbackBuildingEntity();
    }
    const texture = resolveBuildingTexture(layers.textures, firstBuilding.type, null);
    return texture ? new Sprite(texture) : createFallbackBuildingEntity();
};

const syncBuildingSprites = (
    state: ClientState,
    layers: SceneLayers,
    animationCounter: number
): void => {
    syncEntityCache(layers.buildingSprites, layers.objectLayer, state.buildings.keys(), () => createBuildingEntity(layers, state));
    for (const building of state.buildings.values()) {
        const sprite = layers.buildingSprites.get(building.id);
        if (!sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const frame = resolveBuildingTexture(layers.textures, building.type, animationCounter);
            if (frame) {
                sprite.texture = frame;
            }
        }
        sprite.position.set(building.tileX * TILE, building.tileY * TILE);
    }
};

const resolveOverlayBuildingIds = (state: ClientState): string[] => {
    const ids: string[] = [];
    for (const building of state.buildings.values()) {
        if (resolveBuildingOverlay(building.type) !== null) {
            ids.push(building.id);
        }
    }
    return ids;
};

const syncBuildingOverlaySprites = (
    state: ClientState,
    layers: SceneLayers,
    overlayBuildingIds: string[]
): void => {
    syncEntityCache(layers.buildingOverlaySprites, layers.objectLayer, overlayBuildingIds, () => new Sprite());
    for (const buildingId of overlayBuildingIds) {
        const building = state.buildings.get(buildingId);
        const sprite = layers.buildingOverlaySprites.get(buildingId);
        if (!building || !(sprite instanceof Sprite)) {
            continue;
        }
        const overlay = resolveBuildingOverlay(building.type);
        if (!overlay) {
            continue;
        }
        const frame = getFrameTexture(
            layers.textures.items,
            `building-overlay:${overlay.iconIndex}`,
            overlay.iconIndex * 32,
            0,
            32,
            32
        );
        if (frame) {
            sprite.texture = frame;
        }
        sprite.position.set(
            (building.tileX * TILE) + overlay.offset.x,
            (building.tileY * TILE) + overlay.offset.y
        );
    }
};

const createFallbackDefenseEntity = (): Graphics => {
    const entity = new Graphics();
    entity.roundRect(4, 4, TILE - 8, TILE - 8, 2).fill(0x7d8ea8);
    return entity;
};

const createDefenseEntity = (layers: SceneLayers, state: ClientState): Sprite | Graphics => {
    const firstDefense = state.defenses.values().next().value;
    if (!firstDefense) {
        return createFallbackDefenseEntity();
    }
    const texture = resolveDefenseTexture(layers.textures, firstDefense.type, firstDefense.health, firstDefense.maxHealth);
    return texture ? new Sprite(texture) : createFallbackDefenseEntity();
};

const syncDefenseSprites = (state: ClientState, layers: SceneLayers, visibleDefenseIds: string[]): void => {
    syncEntityCache(layers.defenseSprites, layers.objectLayer, visibleDefenseIds, () => createDefenseEntity(layers, state));
    for (const defenseId of visibleDefenseIds) {
        const defense = state.defenses.get(defenseId);
        const sprite = layers.defenseSprites.get(defenseId);
        if (!defense) {
            continue;
        }
        if (!sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const frame = resolveDefenseTexture(
                layers.textures,
                defense.type,
                defense.health,
                defense.maxHealth
            );
            if (frame) {
                sprite.texture = frame;
            }
        }
        sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
    }
};

const resolveDefenseOrientation = (orientation: number | undefined, nowMs: number): number => {
    const fallback = Math.floor((nowMs / 100) % 32);
    if (typeof orientation === "number" && Number.isFinite(orientation)) {
        return orientation;
    }
    return fallback;
};

const syncDefenseHeadSprites = (state: ClientState, layers: SceneLayers, nowMs: number, visibleDefenseIds: string[]): void => {
    syncEntityCache(layers.defenseHeadSprites, layers.objectLayer, visibleDefenseIds, () => new Sprite());
    for (const defenseId of visibleDefenseIds) {
        const defense = state.defenses.get(defenseId);
        const sprite = layers.defenseHeadSprites.get(defenseId);
        if (!defense) {
            continue;
        }
        if (!(sprite instanceof Sprite)) {
            continue;
        }
        const frame = resolveDefenseHeadTexture(
            layers.textures,
            defense.type,
            resolveDefenseOrientation(defense.orientation, nowMs)
        );
        if (frame) {
            sprite.texture = frame;
        }
        sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
    }
};

const createFallbackBulletEntity = (): Graphics => {
    const bullet = new Graphics();
    bullet.circle(0, 0, 3).fill(0xf2cb56);
    return bullet;
};

const createBulletEntity = (layers: SceneLayers): Sprite | Graphics => {
    const sprite = resolveBulletSprite(layers.textures);
    return sprite ?? createFallbackBulletEntity();
};

const syncBulletSprites = (state: ClientState, layers: SceneLayers, nowMs: number): void => {
    syncEntityCache(layers.bulletSprites, layers.objectLayer, state.bullets.keys(), () => createBulletEntity(layers));
    const animation = Math.floor(nowMs / 80) % 4;
    for (const bullet of state.bullets.values()) {
        const sprite = layers.bulletSprites.get(bullet.id);
        if (!sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const rect = resolveBulletFrameRect(animation, Math.max(0, bullet.type));
            const frame = getFrameTexture(
                layers.textures.bullets,
                `bullet:${bullet.id}:${animation}:${bullet.type}`,
                rect.x,
                rect.y,
                rect.width,
                rect.height
            );
            if (frame) {
                sprite.texture = frame;
            }
        }
        sprite.position.set(bullet.x, bullet.y);
    }
};

const renderWorldObjects = (state: ClientState, layers: SceneLayers): void => {
    const nowMs = Date.now();
    const animationCounter = Math.floor(nowMs / 100);
    const researchStripBuildingIds = resolveResearchStripBuildingIds(state);
    const visibleDefenseIds = resolveVisibleDefenseIds(state);
    syncResearchStripSprites(state, layers, researchStripBuildingIds);
    syncBuildingSprites(state, layers, animationCounter);
    syncBuildingOverlaySprites(state, layers, resolveOverlayBuildingIds(state));
    syncDefenseSprites(state, layers, visibleDefenseIds);
    syncDefenseHeadSprites(state, layers, nowMs, visibleDefenseIds);
    renderHazardItems(state, layers.objectLayer, layers.hazardSprites, layers.textures.items);
    syncBulletSprites(state, layers, nowMs);
};

const renderHud = (state: ClientState, layers: SceneLayers): void => {
    recordDebugRenderTick(state);
    void formatNearestOrbableCityLine(resolveNearestOrbableCity(state));
    layers.hudPanel.visible = false;
    layers.hudPanel.clear();
    if (layers.hud.visible || layers.hud.text.length > 0) {
        layers.hud.visible = false;
        layers.hud.text = "";
    }
};

const resolveStaffPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === state.local.city);
    return {
        heading: "Staff",
        lines: [
            `Mayor:   ${assignment?.mayorId ?? "(unknown)"}`,
            `Recruits: ${assignment?.recruitCount ?? 0}`,
            `Players: ${state.remotePlayers.size + (state.local.id ? 1 : 0)}`
        ]
    };
};

const countCityEntities = <T extends { cityId: number; }>(
    values: Iterable<T>,
    cityId: number
): number => {
    let total = 0;
    for (const value of values) {
        if (value.cityId === cityId) {
            total += 1;
        }
    }
    return total;
};

const resolveCityPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const cityId = state.local.city;
    const buildings = countCityEntities(state.buildings.values(), cityId);
    const defenses = countCityEntities(state.defenses.values(), cityId);
    const hazards = countCityEntities(state.hazards.values(), cityId);
    return {
        heading: getCityDisplayName(cityId),
        lines: [
            `Buildings: ${buildings}`,
            `Defenses: ${defenses}`,
            `Hazards: ${hazards}`
        ]
    };
};

const resolvePointsPanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const lastPromotion = state.events.promotions.at(-1);
    return {
        heading: "Points",
        lines: [
            `Score: ${state.scoreProfile.score}`,
            `Rank: ${state.scoreProfile.rank ?? "-"}`,
            `Last promo: ${lastPromotion?.rank ?? "-"}`
        ]
    };
};

const resolveDefaultPanelMessage = (): { heading: string; lines: string[] } => {
    return {
        heading: "Intel",
        lines: ["Right-click a city building to inspect."]
    };
};

const PANEL_MESSAGE_RESOLVERS: Readonly<Record<ClientState["ui"]["panelView"], (state: ClientState) => { heading: string; lines: string[] }>> = {
    staff: resolveStaffPanelMessage,
    city: resolveCityPanelMessage,
    points: resolvePointsPanelMessage,
    status: resolveDefaultPanelMessage
};

const resolvePanelMessage = (state: ClientState): { heading: string; lines: string[] } => {
    const resolver = PANEL_MESSAGE_RESOLVERS[state.ui.panelView];
    return resolver ? resolver(state) : resolveDefaultPanelMessage();
};

type SidePanelRenderContext = {
    state: ClientState;
    layers: SceneLayers;
    panelX: number;
    panelVisualHeight: number;
    nowMs: number;
};

const createSidePanelRenderContext = (state: ClientState, layers: SceneLayers): SidePanelRenderContext => {
    const viewport = resolveViewportFromState(state);
    return {
        state,
        layers,
        panelX: viewport.panelStartX,
        panelVisualHeight: Math.min(viewport.surfaceHeight, PANEL_TOP_HEIGHT + PANEL_BOTTOM_HEIGHT),
        nowMs: Date.now()
    };
};

const resetSidePanelSprites = (layers: SceneLayers): void => {
    layers.panelHomeArrow.visible = false;
    layers.panelInventorySelection.visible = false;
    for (const iconSprite of layers.panelInventoryIcons.values()) {
        iconSprite.visible = false;
    }
    for (const countText of layers.panelInventoryCountTexts.values()) {
        countText.visible = false;
    }
};

const layoutSidePanelSprites = (context: SidePanelRenderContext): void => {
    const { layers, panelX } = context;
    layers.panelBackground.position.set(panelX, PANEL_TOP_Y);
    layers.panelHomeArrow.position.set(panelX + HOME_ARROW.x, HOME_ARROW.y);
    layers.panelHomeArrow.width = HOME_ARROW.frameWidth;
    layers.panelHomeArrow.height = HOME_ARROW.frameHeight;
    layers.panelRadar.position.set(panelX + RADAR_BOUNDS.offsetX, RADAR_BOUNDS.offsetY);
    layers.panelMessageHeading.position.set(panelX + PANEL_MESSAGE.x, PANEL_MESSAGE.y);
    layers.panelMessageBody.position.set(panelX + PANEL_MESSAGE.x, PANEL_MESSAGE.y + PANEL_MESSAGE.lineSpacing);
    layers.panelCashText.position.set(panelX + PANEL_FINANCE.cashText.x, PANEL_FINANCE.cashText.y);
};

const renderSidePanelBackground = (context: SidePanelRenderContext): void => {
    const { layers, panelVisualHeight } = context;
    layers.panelBackground.clear();
    layers.panelBackground
        .rect(0, 0, PANEL, panelVisualHeight)
        .fill({ color: 0x111827, alpha: 0.85 });
    if (layers.textures.interfaceTop) {
        const topHeight = Math.max(0, Math.min(PANEL_TOP_HEIGHT, panelVisualHeight));
        if (topHeight > 0) {
            layers.panelBackground
                .rect(0, 0, PANEL, topHeight)
                .fill({ texture: layers.textures.interfaceTop, alpha: 0.92 });
        }
    }
    layers.panelBackground
        .rect(0, 0, PANEL, panelVisualHeight)
        .stroke({ color: 0x4d5f7a, width: 1, alpha: 0.85 });
    if (layers.textures.interfaceBottom && panelVisualHeight > PANEL_BOTTOM_Y) {
        const bottomHeight = Math.max(0, Math.min(PANEL_BOTTOM_HEIGHT, panelVisualHeight - PANEL_BOTTOM_Y));
        if (bottomHeight > 0) {
            layers.panelBackground
                .rect(0, PANEL_BOTTOM_Y, PANEL, bottomHeight)
                .fill({ texture: layers.textures.interfaceBottom, alpha: 0.9 });
        }
    }
};

const renderSidePanelFinance = (context: SidePanelRenderContext): void => {
    const { state, layers } = context;
    const finance = state.cityFinance.get(state.local.city);
    const income = finance?.income ?? 0;
    const cash = finance?.cash ?? 0;
    if (layers.textures.moneyBox) {
        const moneyBoxWidth = Math.max(1, Math.floor(layers.textures.moneyBox.width));
        const moneyBoxHeight = Math.max(1, Math.floor(layers.textures.moneyBox.height));
        layers.panelBackground
            .rect(PANEL_FINANCE.moneyBox.x, PANEL_FINANCE.moneyBox.y, moneyBoxWidth, moneyBoxHeight)
            .fill({ texture: layers.textures.moneyBox });
    }
    const incomeTexture = income >= 0 ? layers.textures.moneyUp : layers.textures.moneyDown;
    if (incomeTexture) {
        const incomeWidth = Math.max(1, Math.floor(incomeTexture.width));
        const incomeHeight = Math.max(1, Math.floor(incomeTexture.height));
        layers.panelBackground
            .rect(PANEL_FINANCE.incomeIcon.x, PANEL_FINANCE.incomeIcon.y, incomeWidth, incomeHeight)
            .fill({ texture: incomeTexture });
    }
    layers.panelCashText.style.fill = income < 0 ? 0xe74c3c : 0x2ecc71;
    layers.panelCashText.text = formatCash(cash);
};

const renderSidePanelHealth = (context: SidePanelRenderContext): void => {
    const { state, layers } = context;
    const healthMask = resolveHealthMaskRect(state.local.health, state.local.maxHealth);
    layers.panelBackground
        .rect(PANEL_HEALTH.x, PANEL_HEALTH.y, PANEL_HEALTH.width, PANEL_HEALTH.height)
        .fill({ color: 0x061015, alpha: 0.5 });
    if (layers.textures.health && healthMask.height > 0) {
        layers.panelBackground
            .rect(healthMask.x, healthMask.y, healthMask.width, healthMask.height)
            .fill({ texture: layers.textures.health, alpha: 0.95 });
    }
};

const renderSidePanelInventory = (context: SidePanelRenderContext): void => {
    const { state, layers, panelX, nowMs } = context;
    for (const slot of PANEL_INVENTORY_SLOTS) {
        const count = state.inventory.get(slot.itemType) ?? 0;
        if (count <= 0) {
            continue;
        }
        const iconSprite = layers.panelInventoryIcons.get(slot.itemType);
        const bombArmed = slot.itemType === ITEM_TYPE_BOMB
            && state.ui.selectedInventoryItemType === ITEM_TYPE_BOMB
            && state.ui.bombArmed;
        const rect = resolvePanelItemFrameRect(slot.itemType, nowMs, bombArmed);
        const iconFrame = getFrameTexture(
            layers.textures.items,
            `panel-item:${slot.itemType}:${rect.x}:${rect.y}`,
            rect.x,
            rect.y,
            rect.width,
            rect.height
        );
        if (iconSprite && iconFrame) {
            iconSprite.texture = iconFrame;
            iconSprite.alpha = 0.95;
            iconSprite.position.set(panelX + slot.x + (slot.itemType === ITEM_TYPE_ORB ? 2 : 0), slot.y);
            iconSprite.width = 32;
            iconSprite.height = 32;
            iconSprite.visible = true;
        }
        if (layers.textures.inventorySelection && state.ui.selectedInventoryItemType === slot.itemType) {
            layers.panelInventorySelection.texture = layers.textures.inventorySelection;
            layers.panelInventorySelection.alpha = 0.95;
            layers.panelInventorySelection.position.set(panelX + slot.x, slot.y);
            layers.panelInventorySelection.width = 32;
            layers.panelInventorySelection.height = 32;
            layers.panelInventorySelection.visible = true;
        }
        const countValue = Math.max(0, Math.floor(count));
        if (countValue > 1) {
            const countText = layers.panelInventoryCountTexts.get(slot.itemType);
            if (countText) {
                countText.text = `${countValue}`;
                countText.position.set(panelX + slot.x + 22, slot.y + 12);
                countText.visible = true;
            }
        }
    }
};

const renderSidePanelButtons = (context: SidePanelRenderContext): void => {
    const { state, layers } = context;
    for (let i = 0; i < PANEL_BUTTONS.length; i += 1) {
        const active = isPanelButtonActive(state.ui, i);
        const button = PANEL_BUTTONS[i];
        if (!button) {
            continue;
        }
        if (!layers.textures.interfaceTop) {
            layers.panelBackground
                .roundRect(button.x, button.y, button.width, button.height, 4)
                .fill({ color: active ? 0x35547c : 0x223248, alpha: active ? 0.75 : 0.22 })
                .stroke({ color: 0x8ca8c8, width: 1, alpha: 0.9 });
            continue;
        }
        if (!active) {
            continue;
        }
        layers.panelBackground
            .roundRect(button.x, button.y, button.width, button.height, 4)
            .fill({ color: 0x2f6a9f, alpha: 0.28 })
            .stroke({ color: 0xbfd7f5, width: 1, alpha: 0.92 });
    }
};

const renderSidePanelMessage = (context: SidePanelRenderContext): void => {
    const panelMessage = resolvePanelMessage(context.state);
    context.layers.panelMessageHeading.text = panelMessage.heading;
    context.layers.panelMessageHeading.visible = panelMessage.heading.length > 0;
    context.layers.panelMessageBody.text = panelMessage.lines.join("\n");
    context.layers.panelMessageBody.visible = panelMessage.lines.length > 0;
};

const markSidePanelEnemy = (
    context: SidePanelRenderContext,
    enemyX: number,
    enemyY: number
): void => {
    const point = projectRadarPoint(context.panelX, context.state.local.x, context.state.local.y, enemyX, enemyY);
    if (!point) {
        return;
    }
    context.layers.panelRadar
        .circle(point.x, point.y, 2)
        .fill(0xff4040);
};

const renderSidePanelRadar = (context: SidePanelRenderContext): void => {
    context.layers.panelRadar.clear();
    for (const remote of context.state.remotePlayers.values()) {
        if (remote.city === context.state.local.city || (remote.health ?? 1) <= 0) {
            continue;
        }
        markSidePanelEnemy(context, remote.x, remote.y);
    }
    context.layers.panelRadar
        .circle(RADAR_BOUNDS.width / 2, RADAR_BOUNDS.height / 2, 2)
        .fill(0x48ff62);
};

const renderSidePanelHomeArrow = (context: SidePanelRenderContext): void => {
    const spawn = resolveCitySpawn(context.state.local.city);
    if (!spawn || !context.layers.textures.arrows) {
        return;
    }
    const homeX = (spawn.tileX * TILE) + (1.5 * TILE);
    const homeY = (spawn.tileY * TILE) + (1.5 * TILE);
    const arrowFrame = resolveHomeArrowFrame(context.state.local.x, context.state.local.y, homeX, homeY);
    const frame = getFrameTexture(
        context.layers.textures.arrows,
        `home-arrow:${arrowFrame}`,
        arrowFrame * HOME_ARROW.frameWidth,
        0,
        HOME_ARROW.frameWidth,
        HOME_ARROW.frameHeight
    );
    if (!frame) {
        return;
    }
    context.layers.panelHomeArrow.texture = frame;
    context.layers.panelHomeArrow.alpha = 0.95;
    context.layers.panelHomeArrow.visible = true;
};

const renderSidePanel = (state: ClientState, layers: SceneLayers): void => {
    const context = createSidePanelRenderContext(state, layers);
    layoutSidePanelSprites(context);
    resetSidePanelSprites(layers);
    renderSidePanelBackground(context);
    renderSidePanelFinance(context);
    renderSidePanelHealth(context);
    renderSidePanelInventory(context);
    renderSidePanelButtons(context);
    renderSidePanelMessage(context);
    renderSidePanelRadar(context);
    renderSidePanelHomeArrow(context);
};

const renderSceneFrame = (state: ClientState, mapData: LoadedMap, layers: SceneLayers): void => {
    const viewport = resolveViewportFromState(state);
    layers.world.position.set(viewport.centerX, viewport.centerY);
    layers.world.pivot.set(state.local.x, state.local.y);

    const localRow = resolveLocalRole(state) === "mayor" ? 1 : 0;
    updateTankEntityTexture(layers.localTank, layers.textures, localRow, state.local.direction);
    layers.localTank.position.set(state.local.x, state.local.y);
    layers.localTank.rotation = 0;

    syncEntityCache(layers.remoteTanks, layers.remoteLayer, state.remotePlayers.keys(), () => createTankSprite(layers.textures, 2, 0));
    for (const remote of state.remotePlayers.values()) {
        const tank = layers.remoteTanks.get(remote.id);
        if (!tank) {
            continue;
        }
        const isSameCity = remote.city === state.local.city;
        const isMayor = resolveRemoteRole(state, remote.id) === "mayor";
        const remoteRow = isSameCity ? (isMayor ? 1 : 0) : (isMayor ? 3 : 2);
        updateTankEntityTexture(tank, layers.textures, remoteRow, remote.direction);
        tank.position.set(remote.x, remote.y);
        tank.rotation = 0;
    }

    renderGroundLayer(state, layers.world, layers.groundSprite, layers.textures.ground);
    renderTileLayer(
        mapData,
        state.local.x,
        state.local.y,
        layers.world,
        layers.tileSprite,
        layers.textures.rocks,
        layers.textures.lava,
        layers.textures.buildings
    );
    renderWorldObjects(state, layers);
    renderChangingLayer(
        state,
        layers.world,
        layers.changingSprite,
        layers.textures.population,
        layers.textures.smoke,
        layers.textures.blackNumbers,
        layers.textures.items
    );
    syncCommandCenterLabels(state, layers);
    renderGhostPlacement(state, layers);
    renderNameLabels(state, layers.labelLayer, layers.localTank, layers.remoteTanks, layers.labels);
    renderEffects(
        state,
        Date.now(),
        layers.world,
        layers.world,
        layers.effectsSprite,
        layers.effectExplosionSprites,
        layers.textures.muzzleFlash,
        layers.textures.smallExplosion,
        layers.textures.largeExplosion
    );
    renderBotDebugLayer(state, layers.world, layers.botDebugSprite);
    renderHud(state, layers);
    renderSidePanel(state, layers);
}

export type SceneRuntime = {
    app: Application;
    render: () => void;
};

export const createSceneRuntime = async (state: ClientState): Promise<SceneRuntime> => {
    const app = new Application();
    await app.init({
        width: window.innerWidth,
        height: window.innerHeight,
        background: "#15241f",
        antialias: false
    });

    attachCanvasToRoot(app);
    const textures = await loadLegacyTextures();
    const layers = createSceneLayers(app, textures);
    const mapData = await loadMapData();
    state.world.blockingTiles = mapData.blockingTiles;
    state.world.buildBlockingTiles = mapData.buildBlockingTiles;
    state.world.mapSize = mapData.map.length;

    return {
        app,
        render: () => {
            const rect = app.canvas.getBoundingClientRect();
            if (Number.isFinite(rect.width) && rect.width > 0) {
                state.pointer.surfaceWidth = rect.width;
            }
            if (Number.isFinite(rect.height) && rect.height > 0) {
                state.pointer.surfaceHeight = rect.height;
            }
            renderSceneFrame(state, mapData, layers);
        }
    };
};
