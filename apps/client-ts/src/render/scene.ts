import { Application, Container, Sprite } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { renderGroundLayer } from "./layers/GroundLayer.js";
import { renderTileLayer } from "./layers/TileLayer.js";
import { renderChangingLayer } from "./layers/ChangingLayer.js";
import { renderNameLabels } from "./labels/NameLabelRenderer.js";
import { renderEffects } from "./effects/EffectsRenderer.js";
import { renderBotDebugLayer } from "./debug/BotDebugLayer.js";
import { formatNearestOrbableCityLine, resolveNearestOrbableCity } from "./orb-target.js";
import { loadMapData, type LoadedMap } from "../world/map-loader.js";
import { createEmptyTextureSet, loadTextureSet } from "./TextureRegistry.js";
import { createSceneLayers, createTankSprite, resolveTankTexture, type RenderableEntity, type SceneLayers } from "./scene-layers.js";
import { resolveViewportFromState } from "../gameplay/world-viewport.js";
import { resolveTileDrawRadius } from "./layers/terrain-parity-helpers.js";
import { TILE } from "./parity/constants.js";
import { recordDebugRenderTick } from "../app/debug-metrics.js";
import { resolveLocalRenderPosition } from "../app/render-timing.js";
import { renderSidePanel } from "./side-panel.js";
import { renderGhostPlacement, renderWorldObjects, syncCommandCenterLabels } from "./scene-world-objects.js";
import { replaceEntityInLayer, syncEntityCache } from "./scene-world-objects-shared.js";
import { resolveWorldViewBounds } from "./world-bounds.js";
const WORLD_OBJECT_OVERSCAN_PX = TILE * 4;
const RENDER_DIAGNOSTIC_INTERVAL_MS = 3000;
const PIXI_INIT_TIMEOUT_MS = 12000;

const resolveLocalRole = (state: ClientState): "mayor" | "recruit" => {
    const assignment = state.lobby.assignments.find((entry) => entry.city === state.local.city);
    return assignment?.mayorId === state.local.id ? "mayor" : "recruit";
};

const resolveRemoteRole = (state: ClientState, remoteId: string): "mayor" | "recruit" => {
    const assignment = state.lobby.assignments.find((entry) => entry.mayorId === remoteId);
    return assignment ? "mayor" : "recruit";
};
const attachCanvasToRoot = (app: Application): void => {
    const root = document.getElementById("app");
    if (root) {
        root.appendChild(app.canvas);
    }
};
const updateTankEntityTexture = (
    entity: RenderableEntity,
    textures: SceneLayers["textures"],
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
const maybeUpgradeTankEntity = (
    layer: Container,
    entity: RenderableEntity,
    textures: SceneLayers["textures"],
    row: number,
    direction: number
): RenderableEntity => {
    if (entity instanceof Sprite) {
        return entity;
    }
    const frame = resolveTankTexture(textures, row, direction);
    if (!frame) {
        return entity;
    }
    const sprite = new Sprite(frame);
    sprite.anchor.set(0, 0);
    sprite.position.set(entity.position.x, entity.position.y);
    sprite.rotation = entity.rotation;
    replaceEntityInLayer(layer, entity, sprite);
    return sprite;
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

const syncTankEntities = (
    state: ClientState,
    layers: SceneLayers,
    localRender: { x: number; y: number; }
): void => {
    const localRow = resolveLocalRole(state) === "mayor" ? 1 : 0;
    layers.localTank = maybeUpgradeTankEntity(
        layers.world,
        layers.localTank,
        layers.textures,
        localRow,
        state.local.direction
    );
    updateTankEntityTexture(layers.localTank, layers.textures, localRow, state.local.direction);
    layers.localTank.position.set(localRender.x, localRender.y);
    layers.localTank.rotation = 0;

    syncEntityCache(layers.remoteTanks, layers.remoteLayer, state.remotePlayers.keys(), () => createTankSprite(layers.textures, 2, 0));
    for (const remote of state.remotePlayers.values()) {
        let tank = layers.remoteTanks.get(remote.id);
        if (!tank) {
            continue;
        }
        const isSameCity = remote.city === state.local.city;
        const isMayor = resolveRemoteRole(state, remote.id) === "mayor";
        const remoteRow = isSameCity ? (isMayor ? 1 : 0) : (isMayor ? 3 : 2);
        tank = maybeUpgradeTankEntity(
            layers.remoteLayer,
            tank,
            layers.textures,
            remoteRow,
            remote.direction
        );
        layers.remoteTanks.set(remote.id, tank);
        updateTankEntityTexture(tank, layers.textures, remoteRow, remote.direction);
        tank.position.set(remote.x, remote.y);
        tank.rotation = 0;
    }
};

const renderWorldLayers = (
    state: ClientState,
    layers: SceneLayers,
    mapData: LoadedMap,
    localRender: { x: number; y: number; },
    viewBounds: ReturnType<typeof resolveWorldViewBounds>,
    tileDrawRadiusX: number,
    tileDrawRadiusY: number
): void => {
    renderGroundLayer(localRender.x, localRender.y, layers.world, layers.groundSprite, layers.textures.ground);
    renderTileLayer(
        mapData,
        localRender.x,
        localRender.y,
        layers.world,
        layers.tileSprite,
        layers.textures.rocks,
        layers.textures.lava,
        layers.textures.buildings,
        tileDrawRadiusX,
        tileDrawRadiusY
    );
    renderWorldObjects(state, layers, viewBounds);
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
};

const renderSceneFrame = (state: ClientState, mapData: LoadedMap, layers: SceneLayers): void => {
    const nowMs = Date.now();
    const localRender = resolveLocalRenderPosition(state, nowMs);
    const viewport = resolveViewportFromState(state);
    const viewBounds = resolveWorldViewBounds(
        localRender.x,
        localRender.y,
        viewport.worldWidth,
        viewport.worldHeight,
        WORLD_OBJECT_OVERSCAN_PX
    );
    const tileDrawRadiusX = resolveTileDrawRadius(viewport.worldWidth);
    const tileDrawRadiusY = resolveTileDrawRadius(viewport.worldHeight);
    layers.world.position.set(viewport.centerX, viewport.centerY);
    layers.world.pivot.set(localRender.x, localRender.y);

    syncTankEntities(state, layers, localRender);
    renderWorldLayers(state, layers, mapData, localRender, viewBounds, tileDrawRadiusX, tileDrawRadiusY);
    renderNameLabels(state, layers.labelLayer, layers.localTank, layers.remoteTanks, layers.labels);
    renderEffects(
        state,
        Date.now(),
        layers.world,
        layers.world,
        layers.effectsSprite,
        layers.effectExplosionSprites,
        layers.effectFloatingPointLabels,
        layers.textures.muzzleFlash,
        layers.textures.smallExplosion,
        layers.textures.largeExplosion
    );
    renderBotDebugLayer(state, layers.world, layers.botDebugSprite, localRender.x, localRender.y);
    renderHud(state, layers);
    renderSidePanel(state, layers);
}

export type SceneRuntime = {
    app: Application;
    render: () => void;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new Error(`${label} timed out after ${timeoutMs}ms`));
                }, timeoutMs);
            })
        ]);
    } finally {
        if (timeoutId !== null) {
            clearTimeout(timeoutId);
        }
    }
};

const initPixiApplication = async (): Promise<Application> => {
    const attempts: Array<"webgl" | "webgpu"> = ["webgl", "webgpu"];
    let lastError: unknown = null;

    for (const preference of attempts) {
        const app = new Application();
        try {
            console.info("[scene.init] pixi init attempt", { preference });
            await withTimeout(
                app.init({
                    width: window.innerWidth,
                    height: window.innerHeight,
                    background: "#15241f",
                    antialias: false,
                    roundPixels: true,
                    preference
                }),
                PIXI_INIT_TIMEOUT_MS,
                `pixi init (${preference})`
            );
            console.info("[scene.init] pixi init ok", { preference });
            return app;
        } catch (error) {
            lastError = error;
            console.warn("[scene.init] pixi init failed", {
                preference,
                error: error instanceof Error ? error.message : String(error)
            });
            app.destroy(true, { children: true, texture: false });
        }
    }

    throw new Error(
        `pixi init failed for all renderers: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    );
};

export const createSceneRuntime = async (state: ClientState): Promise<SceneRuntime> => {
    const app = await initPixiApplication();

    attachCanvasToRoot(app);
    const textures = createEmptyTextureSet();
    console.info("[scene.init] loading classic textures");
    void loadTextureSet()
        .then((loadedTextures) => {
            Object.assign(textures, loadedTextures);
            const textureEntries = Object.entries(textures);
            const loadedTextureCount = textureEntries.filter(([, texture]) => texture !== null).length;
            console.info("[scene.init] textures ready", {
                loaded: loadedTextureCount,
                total: textureEntries.length
            });
        })
        .catch((error) => {
            console.warn("[scene.init] texture preload failed", error);
        });
    const layers = createSceneLayers(app, textures);
    const mapData = await loadMapData();
    console.info("[scene.init] map ready", {
        size: mapData.map.length,
        blockingTiles: mapData.blockingTiles.size,
        buildBlockingTiles: mapData.buildBlockingTiles.size
    });
    state.world.blockingTiles = mapData.blockingTiles;
    state.world.buildBlockingTiles = mapData.buildBlockingTiles;
    state.world.mapSize = mapData.map.length;
    let lastDiagnosticAt = 0;
    let renderedFrames = 0;

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
            renderedFrames += 1;
            const nowMs = Date.now();
            if ((nowMs - lastDiagnosticAt) >= RENDER_DIAGNOSTIC_INTERVAL_MS) {
                lastDiagnosticAt = nowMs;
                console.info("[scene.render]", {
                    frames: renderedFrames,
                    canvas: {
                        width: Math.floor(rect.width),
                        height: Math.floor(rect.height)
                    },
                    local: {
                        id: state.local.id,
                        city: state.local.city,
                        x: Math.floor(state.local.x),
                        y: Math.floor(state.local.y)
                    },
                    entities: {
                        remotePlayers: state.remotePlayers.size,
                        buildings: state.buildings.size,
                        hazards: state.hazards.size,
                        defenses: state.defenses.size,
                        bullets: state.bullets.size
                    },
                    layerChildren: layers.world.children.length
                });
            }
        }
    };
};
