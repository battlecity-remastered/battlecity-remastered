import { Application, Container, Graphics, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { reconcileEntityCache } from "./entity-cache.js";
import { resolveGhostPlacement } from "../ui/build-menu/GhostPlacement.js";
import { buildHudLines } from "./hud-lines.js";
import { createDirtyFlagTracker } from "./dirty-flags.js";

const TANK_SIZE = 18;
const TILE_SIZE = 48;

const makeTank = (color: number): Graphics => {
    const tank = new Graphics();
    tank.rect(-TANK_SIZE / 2, -TANK_SIZE / 2, TANK_SIZE, TANK_SIZE).fill(color);
    tank.rect(0, -2, TANK_SIZE / 2 + 8, 4).fill(0xdde7ef);
    return tank;
};

const applyLocalTank = (state: ClientState, tank: Graphics): void => {
    tank.position.set(state.local.x, state.local.y);
    tank.rotation = (state.local.direction / 32) * (Math.PI * 2);
};

const syncRemoteTanks = (
    state: ClientState,
    remoteLayer: Container,
    remoteTanks: Map<string, Graphics>
): void => {
    reconcileEntityCache(
        remoteTanks,
        state.remotePlayers.keys(),
        () => {
            const tank = makeTank(0xf3655a);
            remoteLayer.addChild(tank);
            return tank;
        },
        (_remoteId, tank) => {
            remoteLayer.removeChild(tank);
            tank.destroy();
        }
    );
};

const applyRemoteTankTransforms = (state: ClientState, remoteTanks: Map<string, Graphics>): void => {
    for (const remote of state.remotePlayers.values()) {
        const tank = remoteTanks.get(remote.id);
        if (!tank) {
            continue;
        }
        tank.position.set(remote.x, remote.y);
        tank.rotation = (remote.direction / 32) * (Math.PI * 2);
    }
};

const syncTileEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>,
    color: number
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const entity = new Graphics();
            entity.rect(0, 0, TILE_SIZE, TILE_SIZE).fill(color);
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

const syncCircleEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>,
    color: number
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const entity = new Graphics();
            entity.circle(0, 0, TILE_SIZE / 3).fill(color);
            layer.addChild(entity);
            return entity;
        },
        (_id, entity) => {
            layer.removeChild(entity);
            entity.destroy();
        }
    );
};

const syncBulletEntities = (
    cache: Map<string, Graphics>,
    layer: Container,
    desiredIds: Iterable<string>
): void => {
    reconcileEntityCache(
        cache,
        desiredIds,
        () => {
            const bullet = new Graphics();
            bullet.circle(0, 0, 4).fill(0xf8e45c);
            layer.addChild(bullet);
            return bullet;
        },
        (_id, bullet) => {
            layer.removeChild(bullet);
            bullet.destroy();
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
    localTank: Graphics;
    remoteLayer: Container;
    remoteTanks: Map<string, Graphics>;
    objectLayer: Container;
    buildingSprites: Map<string, Graphics>;
    defenseSprites: Map<string, Graphics>;
    hazardSprites: Map<string, Graphics>;
    bulletSprites: Map<string, Graphics>;
    ghostPlacementSprite: Graphics;
    hud: Text;
    dirty: ReturnType<typeof createDirtyFlagTracker>;
};

const createSceneLayers = (app: Application): SceneLayers => {
    const world = new Container();
    app.stage.addChild(world);

    const localTank = makeTank(0x7fe66f);
    world.addChild(localTank);

    const remoteLayer = new Container();
    world.addChild(remoteLayer);

    const objectLayer = new Container();
    world.addChild(objectLayer);

    const ghostPlacementSprite = new Graphics();
    ghostPlacementSprite.visible = false;
    objectLayer.addChild(ghostPlacementSprite);

    return {
        localTank,
        remoteLayer,
        remoteTanks: new Map<string, Graphics>(),
        objectLayer,
        buildingSprites: new Map<string, Graphics>(),
        defenseSprites: new Map<string, Graphics>(),
        hazardSprites: new Map<string, Graphics>(),
        bulletSprites: new Map<string, Graphics>(),
        ghostPlacementSprite,
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
        .fill({
            color: ghostPlacement.blocked ? 0xff5a6f : 0x4ae18f,
            alpha: 0.3
        })
        .stroke({
            color: ghostPlacement.blocked ? 0xffa7b1 : 0xc2ffd6,
            alpha: 0.9,
            width: 2
        });
    sprite.position.set(
        ghostPlacement.tileX * TILE_SIZE,
        ghostPlacement.tileY * TILE_SIZE
    );
};

const renderTiles = (state: ClientState, layers: SceneLayers): void => {
    syncTileEntities(layers.buildingSprites, layers.objectLayer, state.buildings.keys(), 0x3f85ff);
    for (const building of state.buildings.values()) {
        const sprite = layers.buildingSprites.get(building.id);
        if (sprite) {
            sprite.position.set(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE);
        }
    }

    syncTileEntities(layers.defenseSprites, layers.objectLayer, state.defenses.keys(), 0xffb347);
    for (const defense of state.defenses.values()) {
        const sprite = layers.defenseSprites.get(defense.id);
        if (sprite) {
            sprite.position.set(defense.tileX * TILE_SIZE, defense.tileY * TILE_SIZE);
        }
    }
};

const renderDynamicEntities = (state: ClientState, layers: SceneLayers): void => {
    syncCircleEntities(layers.hazardSprites, layers.objectLayer, state.hazards.keys(), 0xff5e73);
    for (const hazard of state.hazards.values()) {
        const sprite = layers.hazardSprites.get(hazard.id);
        if (sprite) {
            sprite.position.set(hazard.x, hazard.y);
        }
    }

    syncBulletEntities(layers.bulletSprites, layers.objectLayer, state.bullets.keys());
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
    if (state.ui.showHud) {
        const next = buildHudLines(state).join("\n");
        if (dirty.shouldRender("hud", next)) {
            hud.text = next;
        }
    } else {
        dirty.markDirty("hud");
    }
};

const renderSceneFrame = (state: ClientState, layers: SceneLayers): void => {
    applyLocalTank(state, layers.localTank);
    syncRemoteTanks(state, layers.remoteLayer, layers.remoteTanks);
    applyRemoteTankTransforms(state, layers.remoteTanks);

    renderTiles(state, layers);
    renderDynamicEntities(state, layers);
    renderGhostPlacement(state, layers.ghostPlacementSprite);
    renderHud(state, layers);
};

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

    return {
        app,
        render: () => {
            renderSceneFrame(state, layers);
        }
    };
};
