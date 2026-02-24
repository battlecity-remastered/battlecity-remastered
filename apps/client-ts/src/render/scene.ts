import { Application, Container, Graphics, Sprite, type Texture, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { reconcileEntityCache } from "./entity-cache.js";
import { resolveGhostPlacement } from "../ui/build-menu/GhostPlacement.js";
import { buildHudLines } from "./hud-lines.js";
import { createDirtyFlagTracker } from "./dirty-flags.js";
import { renderHazardItems } from "./items/ItemRenderer.js";
import { renderGroundLayer } from "./layers/GroundLayer.js";
import { renderTileLayer } from "./layers/TileLayer.js";
import { renderChangingLayer } from "./layers/ChangingLayer.js";
import { renderNameLabels } from "./labels/NameLabelRenderer.js";
import { renderEffects } from "./effects/EffectsRenderer.js";
import { renderBotDebugLayer } from "./debug/BotDebugLayer.js";
import { loadMapData, type LoadedMap } from "../world/map-loader.js";
import { getFrameTexture, loadLegacyTextures, type LegacyTextures } from "./LegacyTextureRegistry.js";
import {
    resolveBuildingAnimationFrameX,
    resolveBuildingBaseFrame,
    resolveBuildingOverlay
} from "./layers/building-parity-helpers.js";
import { resolveBulletFrameRect } from "./items/item-parity-helpers.js";
import {
    isPanelButtonActive,
    PANEL_BUTTONS,
    resolveRadarColor
} from "./panel/panel-visuals.js";
import { WORLD_MAX, resolveViewportFromState } from "../gameplay/world-viewport.js";
import {
    PANEL,
    RADAR_HEIGHT,
    RADAR_WIDTH,
    TILE
} from "./parity/constants.js";

const TANK_SIZE = 22;

type TankPalette = {
    tread: number;
    body: number;
    turret: number;
    barrel: number;
};

type RenderableEntity = Graphics | Sprite;

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

const syncEntityCache = (
    cache: Map<string, RenderableEntity>,
    layer: Container,
    ids: Iterable<string>,
    create: () => RenderableEntity
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
    sprite.anchor.set(0.5, 0.5);
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
    app.stage.addChild(panel);

    const hud = new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 13,
            fill: 0xd8ead8
        }
    });
    hud.position.set(20, 18);
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
    buildingSprites: Map<string, RenderableEntity>;
    buildingOverlaySprites: Map<string, RenderableEntity>;
    defenseSprites: Map<string, RenderableEntity>;
    defenseHeadSprites: Map<string, RenderableEntity>;
    hazardSprites: Map<string, RenderableEntity>;
    bulletSprites: Map<string, RenderableEntity>;
    ghostPlacementSprite: Graphics;
    groundSprite: Graphics;
    tileSprite: Graphics;
    changingSprite: Graphics;
    effectsSprite: Graphics;
    botDebugSprite: Graphics;
    labelLayer: Container;
    labels: Map<string, Text>;
    hud: Text;
    hudPanel: Graphics;
    panelBackground: Graphics;
    panelRadar: Graphics;
    panelText: Text;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

const createSceneLayers = (app: Application, textures: LegacyTextures): SceneLayers => {
    const world = new Container();
    app.stage.addChild(world);

    const groundSprite = new Graphics();
    const tileSprite = new Graphics();
    const objectLayer = new Container();
    const changingSprite = new Graphics();
    const effectsSprite = new Graphics();
    const botDebugSprite = new Graphics();

    world.addChild(groundSprite);
    world.addChild(tileSprite);
    world.addChild(objectLayer);
    world.addChild(changingSprite);
    world.addChild(effectsSprite);
    world.addChild(botDebugSprite);

    const localTank = createTankSprite(textures, 0, 0);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);

    const labelLayer = new Container();
    world.addChild(labelLayer);

    const ghostPlacementSprite = new Graphics();
    ghostPlacementSprite.visible = false;
    objectLayer.addChild(ghostPlacementSprite);

    const hudElements = createHud(app);
    const panelBackground = new Graphics();
    const panelRadar = new Graphics();
    const panelText = new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 11,
            fill: 0xe9f2ff
        }
    });
    app.stage.addChild(panelBackground);
    app.stage.addChild(panelRadar);
    app.stage.addChild(panelText);

    return {
        textures,
        world,
        localTank,
        remoteLayer,
        remoteTanks: new Map<string, RenderableEntity>(),
        objectLayer,
        buildingSprites: new Map<string, RenderableEntity>(),
        buildingOverlaySprites: new Map<string, RenderableEntity>(),
        defenseSprites: new Map<string, RenderableEntity>(),
        defenseHeadSprites: new Map<string, RenderableEntity>(),
        hazardSprites: new Map<string, RenderableEntity>(),
        bulletSprites: new Map<string, RenderableEntity>(),
        ghostPlacementSprite,
        groundSprite,
        tileSprite,
        changingSprite,
        effectsSprite,
        botDebugSprite,
        labelLayer,
        labels: new Map<string, Text>(),
        hud: hudElements.label,
        hudPanel: hudElements.panel,
        panelBackground,
        panelRadar,
        panelText,
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

const renderGhostPlacement = (state: ClientState, sprite: Graphics): void => {
    const ghostPlacement = resolveGhostPlacement(state);
    if (!ghostPlacement) {
        sprite.visible = false;
        return;
    }

    sprite.visible = true;
    sprite.clear();
    sprite
        .rect(0, 0, TILE * 3, TILE * 3)
        .fill({ color: ghostPlacement.blocked ? 0xff5a6f : 0x4ae18f, alpha: 0.3 })
        .stroke({ color: ghostPlacement.blocked ? 0xffa7b1 : 0xc2ffd6, alpha: 0.9, width: 2 });
    sprite.position.set(ghostPlacement.tileX * TILE, ghostPlacement.tileY * TILE);
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

const resolveDefenseTexture = (textures: LegacyTextures, defenseType: number): Texture | null => {
    const row = Math.max(0, Math.min(2, defenseType - 8));
    return getFrameTexture(textures.turretBase, `defense:${row}`, 0, row * 48, 48, 48);
};

const resolveDefenseHeadTexture = (textures: LegacyTextures, defenseType: number, orientation: number): Texture | null => {
    const row = Math.max(0, Math.min(2, defenseType - 9));
    const frame = Math.max(0, Math.min(15, orientation % 16));
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

const renderWorldObjects = (state: ClientState, layers: SceneLayers): void => {
    const animationCounter = Math.floor(Date.now() / 100);

    syncEntityCache(layers.buildingSprites, layers.objectLayer, state.buildings.keys(), () => {
        const firstBuilding = state.buildings.values().next().value;
        if (firstBuilding) {
            const texture = resolveBuildingTexture(layers.textures, firstBuilding.type, null);
            if (texture) {
                return new Sprite(texture);
            }
        }
        const entity = new Graphics();
        entity.roundRect(0, 0, TILE * 3, TILE * 3, 3).fill(0x8e7a56);
        return entity;
    });
    for (const building of state.buildings.values()) {
        const sprite = layers.buildingSprites.get(building.id);
        if (sprite) {
            if (sprite instanceof Sprite) {
                const frame = resolveBuildingTexture(
                    layers.textures,
                    building.type,
                    building.health < building.maxHealth ? animationCounter : null
                );
                if (frame) {
                    sprite.texture = frame;
                }
            }
            sprite.position.set(building.tileX * TILE, building.tileY * TILE);
        }
    }

    const overlayBuildingIds = [...state.buildings.values()]
        .filter((building) => resolveBuildingOverlay(building.type) !== null)
        .map((building) => building.id);

    syncEntityCache(layers.buildingOverlaySprites, layers.objectLayer, overlayBuildingIds, () => {
        const sprite = new Sprite();
        return sprite;
    });

    for (const buildingId of overlayBuildingIds) {
        const building = state.buildings.get(buildingId);
        const sprite = layers.buildingOverlaySprites.get(buildingId);
        if (!building || !sprite) {
            continue;
        }
        if (!(sprite instanceof Sprite)) {
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

    syncEntityCache(layers.defenseSprites, layers.objectLayer, state.defenses.keys(), () => {
        const firstDefense = state.defenses.values().next().value;
        if (firstDefense) {
            const texture = resolveDefenseTexture(layers.textures, firstDefense.type);
            if (texture) {
                return new Sprite(texture);
            }
        }
        const entity = new Graphics();
        entity.roundRect(4, 4, TILE - 8, TILE - 8, 2).fill(0x7d8ea8);
        return entity;
    });
    for (const defense of state.defenses.values()) {
        const sprite = layers.defenseSprites.get(defense.id);
        if (sprite) {
            if (sprite instanceof Sprite) {
                const frame = resolveDefenseTexture(layers.textures, defense.type);
                if (frame) {
                    sprite.texture = frame;
                }
            }
            sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
        }
    }

    syncEntityCache(layers.defenseHeadSprites, layers.objectLayer, state.defenses.keys(), () => {
        const sprite = new Sprite();
        return sprite;
    });
    for (const defense of state.defenses.values()) {
        const sprite = layers.defenseHeadSprites.get(defense.id);
        if (!sprite || !(sprite instanceof Sprite)) {
            continue;
        }
        const orientation = Math.floor((Date.now() / 100) % 16);
        const frame = resolveDefenseHeadTexture(layers.textures, defense.type, orientation);
        if (frame) {
            sprite.texture = frame;
        }
        sprite.position.set(defense.tileX * TILE, defense.tileY * TILE);
    }

    renderHazardItems(state, layers.objectLayer, layers.hazardSprites, layers.textures.items);

    syncEntityCache(layers.bulletSprites, layers.objectLayer, state.bullets.keys(), () => {
        const textureSprite = resolveBulletSprite(layers.textures);
        if (textureSprite) {
            return textureSprite;
        }
        const bullet = new Graphics();
        bullet.circle(0, 0, 3).fill(0xf2cb56);
        return bullet;
    });
    for (const bullet of state.bullets.values()) {
        const sprite = layers.bulletSprites.get(bullet.id);
        if (!sprite) {
            continue;
        }
        if (sprite instanceof Sprite) {
            const animation = Math.floor(Date.now() / 80) % 4;
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

const renderHud = (state: ClientState, layers: SceneLayers): void => {
    const { hud, hudPanel, dirty } = layers;
    hud.visible = state.ui.showHud;
    hudPanel.visible = state.ui.showHud;
    if (!state.ui.showHud) {
        dirty.markDirty("hud");
        return;
    }
    const next = buildHudLines(state).join("\n");
    if (dirty.shouldRender("hud", next)) {
        hud.text = next;
        hudPanel.clear();
        hudPanel
            .roundRect(0, 0, hud.width + 16, hud.height + 16, 4)
            .fill({ color: 0x0a1110, alpha: 0.62 })
            .stroke({ color: 0x5f8362, width: 1, alpha: 0.9 });
    }
};

const toRadarCoord = (value: number, max: number, size: number): number => {
    const normalized = Math.min(Math.max(value, 0), max) / max;
    return Math.min(size - 1, Math.max(0, Math.floor(normalized * size)));
};

const resolvePanelDetailLines = (state: ClientState): string[] => {
    const cityId = state.local.city;
    if (state.ui.panelView === "staff") {
        const assignment = state.lobby.assignments.find((entry) => entry.city === cityId);
        return [
            `Mayor: ${assignment?.mayorId ?? "-"}`,
            `Recruits: ${assignment?.recruitCount ?? 0}`,
            `Remote: ${state.remotePlayers.size}`
        ];
    }
    if (state.ui.panelView === "city") {
        const buildings = Array.from(state.buildings.values()).filter((entry) => entry.cityId === cityId).length;
        const defenses = Array.from(state.defenses.values()).filter((entry) => entry.cityId === cityId).length;
        const hazards = Array.from(state.hazards.values()).filter((entry) => entry.cityId === cityId).length;
        return [
            `Buildings: ${buildings}`,
            `Defenses: ${defenses}`,
            `Hazards: ${hazards}`
        ];
    }
    if (state.ui.panelView === "points") {
        const lastPromotion = state.events.promotions.at(-1);
        return [
            `Score: ${state.scoreProfile.score}`,
            `Rank: ${state.scoreProfile.rank ?? "-"}`,
            `Last promo: ${lastPromotion?.rank ?? "-"}`
        ];
    }
    const finance = state.cityFinance.get(cityId);
    const cash = finance?.cash ?? 0;
    const income = finance?.income ?? 0;
    return [
        `HP ${state.local.health}/${state.local.maxHealth}`,
        `Cash ${cash}  Inc ${income}`,
        `Items ${state.inventory.get(0) ?? 0}`,
        `Research ${state.research.get(cityId)?.completed.length ?? 0}`
    ];
};

const renderPanelGlyphs = (state: ClientState, layers: SceneLayers): void => {
    const iconSize = 12;
    const iconX = 10;
    const healthY = 34;
    const cashY = 50;
    const researchY = 66;

    if (layers.textures.health) {
        layers.panelBackground
            .rect(iconX, healthY, iconSize, iconSize)
            .fill({ texture: layers.textures.health, alpha: 0.95 });
    }
    if (layers.textures.moneyUp) {
        layers.panelBackground
            .rect(iconX, cashY, iconSize, iconSize)
            .fill({ texture: layers.textures.moneyUp, alpha: 0.95 });
    } else if (layers.textures.moneyDown) {
        layers.panelBackground
            .rect(iconX, cashY, iconSize, iconSize)
            .fill({ texture: layers.textures.moneyDown, alpha: 0.95 });
    }
    const researchTexture = state.research.get(state.local.city)?.active
        ? layers.textures.research
        : layers.textures.researchComplete;
    if (researchTexture) {
        layers.panelBackground
            .rect(iconX, researchY, iconSize, iconSize)
            .fill({ texture: researchTexture, alpha: 0.95 });
    }
};

const renderSidePanel = (state: ClientState, layers: SceneLayers): void => {
    const viewport = resolveViewportFromState(state);
    const panelX = viewport.panelStartX;
    layers.panelBackground.position.set(panelX, 0);
    layers.panelRadar.position.set(panelX + 28, 8);
    layers.panelText.position.set(panelX + 10, 10);
    layers.panelBackground.clear();

    if (layers.textures.interfaceTop) {
        layers.panelBackground
            .rect(0, 0, PANEL, viewport.surfaceHeight)
            .fill({ texture: layers.textures.interfaceTop, alpha: 0.92 });
    } else {
        layers.panelBackground
            .rect(0, 0, PANEL, viewport.surfaceHeight)
            .fill({ color: 0x111827, alpha: 0.85 });
    }

    layers.panelBackground
        .rect(0, 0, PANEL, viewport.surfaceHeight)
        .stroke({ color: 0x4d5f7a, width: 1, alpha: 0.85 });

    if (layers.textures.interfaceBottom) {
        layers.panelBackground
            .rect(0, Math.max(0, viewport.surfaceHeight - 128), PANEL, 128)
            .fill({ texture: layers.textures.interfaceBottom, alpha: 0.9 });
    }

    renderPanelGlyphs(state, layers);

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

    const detailLines = resolvePanelDetailLines(state);
    layers.panelText.text = [
        `City ${state.local.city} ${resolveLocalRole(state)}`,
        `HP ${state.local.health}/${state.local.maxHealth}`,
        ...detailLines,
        "",
        "Radar"
    ].join("\n");

    layers.panelRadar.clear();
    if (layers.textures.radarColors) {
        layers.panelRadar
            .rect(0, 0, RADAR_WIDTH, RADAR_HEIGHT)
            .fill({ texture: layers.textures.radarColors, alpha: 0.82 })
            .stroke({ color: 0x94b4d6, width: 1, alpha: 0.85 });
    } else {
        layers.panelRadar
            .rect(0, 0, RADAR_WIDTH, RADAR_HEIGHT)
            .fill({ color: 0x081018, alpha: 0.78 })
            .stroke({ color: 0x94b4d6, width: 1, alpha: 0.85 });
    }
    const mark = (x: number, y: number, color: number): void => {
        const rx = toRadarCoord(x, WORLD_MAX, RADAR_WIDTH);
        const ry = toRadarCoord(y, WORLD_MAX, RADAR_HEIGHT);
        layers.panelRadar.rect(rx, ry, 2, 2).fill(color);
    };
    for (const building of state.buildings.values()) {
        mark(building.tileX * TILE, building.tileY * TILE, resolveRadarColor("building"));
    }
    for (const remote of state.remotePlayers.values()) {
        mark(
            remote.x,
            remote.y,
            resolveRadarColor(remote.city === state.local.city ? "ally" : "enemy")
        );
    }
    mark(state.local.x, state.local.y, resolveRadarColor("self"));
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
        layers.textures.research,
        layers.textures.researchComplete,
        layers.textures.smoke,
        layers.textures.blackNumbers
    );
    renderGhostPlacement(state, layers.ghostPlacementSprite);
    renderNameLabels(state, layers.labelLayer, layers.localTank, layers.remoteTanks, layers.labels);
    renderEffects(
        state,
        Date.now(),
        layers.world,
        layers.world,
        layers.effectsSprite,
        layers.textures.muzzleFlash,
        layers.textures.smallExplosion
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
