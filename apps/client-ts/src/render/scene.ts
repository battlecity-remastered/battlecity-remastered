import { Application, Container, Graphics, Text } from "pixi.js";
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

const TANK_SIZE = 18;
const TILE_SIZE = 48;

const makeTank = (color: number): Graphics => {
    const tank = new Graphics();
    tank.rect(-TANK_SIZE / 2, -TANK_SIZE / 2, TANK_SIZE, TANK_SIZE).fill(color);
    tank.rect(0, -2, TANK_SIZE / 2 + 8, 4).fill(0xdde7ef);
    return tank;
};

const syncEntityCache = (
    cache: Map<string, Graphics>,
    layer: Container,
    ids: Iterable<string>,
    create: () => Graphics
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

const attachCanvasToRoot = (app: Application): void => {
    const root = document.getElementById("app");
    if (root) {
        root.appendChild(app.canvas);
    }
};

const createHud = (app: Application): Text => {
    const hud = new Text({
        text: "",
        style: {
            fontFamily: "monospace",
            fontSize: 16,
            fill: 0xffffff
        }
    });
    hud.position.set(16, 16);
    app.stage.addChild(hud);
    return hud;
};

type SceneLayers = {
    world: Container;
    localTank: Graphics;
    remoteLayer: Container;
    remoteTanks: Map<string, Graphics>;
    objectLayer: Container;
    buildingSprites: Map<string, Graphics>;
    defenseSprites: Map<string, Graphics>;
    hazardSprites: Map<string, Graphics>;
    bulletSprites: Map<string, Graphics>;
    ghostPlacementSprite: Graphics;
    groundSprite: Graphics;
    tileSprite: Graphics;
    changingSprite: Graphics;
    effectsSprite: Graphics;
    botDebugSprite: Graphics;
    labelLayer: Container;
    labels: Map<string, Text>;
    hud: Text;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

const createSceneLayers = (app: Application): SceneLayers => {
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

    const localTank = makeTank(0x7fe66f);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);

    const labelLayer = new Container();
    world.addChild(labelLayer);

    const ghostPlacementSprite = new Graphics();
    ghostPlacementSprite.visible = false;
    objectLayer.addChild(ghostPlacementSprite);

    return {
        world,
        localTank,
        remoteLayer,
        remoteTanks: new Map<string, Graphics>(),
        objectLayer,
        buildingSprites: new Map<string, Graphics>(),
        defenseSprites: new Map<string, Graphics>(),
        hazardSprites: new Map<string, Graphics>(),
        bulletSprites: new Map<string, Graphics>(),
        ghostPlacementSprite,
        groundSprite,
        tileSprite,
        changingSprite,
        effectsSprite,
        botDebugSprite,
        labelLayer,
        labels: new Map<string, Text>(),
        hud: createHud(app),
        dirty: createDirtyFlagTracker()
    };
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
        .rect(0, 0, TILE_SIZE, TILE_SIZE)
        .fill({ color: ghostPlacement.blocked ? 0xff5a6f : 0x4ae18f, alpha: 0.3 })
        .stroke({ color: ghostPlacement.blocked ? 0xffa7b1 : 0xc2ffd6, alpha: 0.9, width: 2 });
    sprite.position.set(ghostPlacement.tileX * TILE_SIZE, ghostPlacement.tileY * TILE_SIZE);
};

const renderWorldObjects = (state: ClientState, layers: SceneLayers): void => {
    syncEntityCache(layers.buildingSprites, layers.objectLayer, state.buildings.keys(), () => {
        const entity = new Graphics();
        entity.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(0x3f85ff);
        return entity;
    });
    for (const building of state.buildings.values()) {
        const sprite = layers.buildingSprites.get(building.id);
        if (sprite) {
            sprite.position.set(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE);
        }
    }

    syncEntityCache(layers.defenseSprites, layers.objectLayer, state.defenses.keys(), () => {
        const entity = new Graphics();
        entity.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(0xffb347);
        return entity;
    });
    for (const defense of state.defenses.values()) {
        const sprite = layers.defenseSprites.get(defense.id);
        if (sprite) {
            sprite.position.set(defense.tileX * TILE_SIZE, defense.tileY * TILE_SIZE);
        }
    }

    renderHazardItems(state, layers.objectLayer, layers.hazardSprites);

    syncEntityCache(layers.bulletSprites, layers.objectLayer, state.bullets.keys(), () => {
        const bullet = new Graphics();
        bullet.circle(0, 0, 4).fill(0xf8e45c);
        return bullet;
    });
    for (const bullet of state.bullets.values()) {
        const sprite = layers.bulletSprites.get(bullet.id);
        if (sprite) {
            sprite.position.set(bullet.x, bullet.y);
        }
    }
};

const renderHud = (state: ClientState, layers: SceneLayers): void => {
    const { hud, dirty } = layers;
    hud.visible = state.ui.showHud;
    if (!state.ui.showHud) {
        dirty.markDirty("hud");
        return;
    }
    const next = buildHudLines(state).join("\n");
    if (dirty.shouldRender("hud", next)) {
        hud.text = next;
    }
};

const renderSceneFrame = (state: ClientState, mapData: LoadedMap, layers: SceneLayers): void => {
    layers.localTank.position.set(state.local.x, state.local.y);
    layers.localTank.rotation = (state.local.direction / 32) * (Math.PI * 2);

    syncEntityCache(layers.remoteTanks, layers.remoteLayer, state.remotePlayers.keys(), () => makeTank(0xf3655a));
    for (const remote of state.remotePlayers.values()) {
        const tank = layers.remoteTanks.get(remote.id);
        if (!tank) {
            continue;
        }
        tank.position.set(remote.x, remote.y);
        tank.rotation = (remote.direction / 32) * (Math.PI * 2);
    }

    renderGroundLayer(state, layers.world, layers.groundSprite);
    renderTileLayer(mapData, state.local.x, state.local.y, layers.world, layers.tileSprite);
    renderWorldObjects(state, layers);
    renderChangingLayer(state, layers.world, layers.changingSprite);
    renderGhostPlacement(state, layers.ghostPlacementSprite);
    renderNameLabels(state, layers.labelLayer, layers.localTank, layers.remoteTanks, layers.labels);
    renderEffects(state, Date.now(), layers.world, layers.world, layers.effectsSprite);
    renderBotDebugLayer(state, layers.world, layers.botDebugSprite);
    renderHud(state, layers);
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
        background: "#09151f",
        antialias: false
    });

    attachCanvasToRoot(app);
    const layers = createSceneLayers(app);
    const mapData = await loadMapData();

    return {
        app,
        render: () => {
            renderSceneFrame(state, mapData, layers);
        }
    };
};
