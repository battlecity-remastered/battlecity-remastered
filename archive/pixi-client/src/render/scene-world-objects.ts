import { Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import type { SceneLayers } from "./scene-layers.js";
import { resolveGhostPlacement } from "../ui/build-menu/GhostPlacement.js";
import { resolveBuildingBaseFrame } from "./layers/building-parity-helpers.js";
import { getFrameTexture } from "./TextureRegistry.js";
import { isCommandCenterType } from "./layers/changing-layer-helpers.js";
import { renderHazardItems } from "./items/ItemRenderer.js";
import { getCityDisplayName, resolveCitySpawn } from "../world/city-spawn.js";
import { type WorldViewBounds } from "./world-bounds.js";
import { TILE } from "./parity/constants.js";
import { syncEntityCache } from "./scene-world-objects-shared.js";
import { syncWorldBuildingSprites } from "./scene-world-buildings.js";
import { syncWorldDefenseSprites } from "./scene-world-defenses.js";
import { syncWorldBulletSprites } from "./scene-world-bullets.js";

const COMMAND_CENTER_LABEL_OFFSET_Y = -32;
const COMMAND_CENTER_LABEL_VIEW_THRESHOLD = 40 * TILE;
const COMMAND_CENTER_LABEL_RESOLUTION = 2;

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

const resolveCommandCenterCityIds = (state: ClientState): number[] => {
    const cityIds = new Set<number>();
    cityIds.add(state.local.city);
    for (const assignment of state.lobby.assignments) {
        cityIds.add(assignment.city);
    }
    for (const cityId of state.cityFinance.keys()) {
        cityIds.add(cityId);
    }
    for (const remote of state.remotePlayers.values()) {
        cityIds.add(remote.city);
    }
    for (const building of state.buildings.values()) {
        if (isCommandCenterType(building.type)) {
            cityIds.add(building.cityId);
        }
    }
    return [...cityIds].filter((cityId) => Number.isFinite(cityId));
};

export const syncCommandCenterLabels = (state: ClientState, layers: SceneLayers): void => {
    const cityIds = resolveCommandCenterCityIds(state);
    const labelKeys = cityIds.map((cityId) => `city:${cityId}`);
    syncEntityCache(layers.commandCenterLabels, layers.commandCenterLabelLayer, labelKeys, createCommandCenterLabel);
    for (const cityId of cityIds) {
        const spawn = resolveCitySpawn(cityId);
        if (!spawn) {
            continue;
        }
        const label = layers.commandCenterLabels.get(`city:${cityId}`);
        if (!label) {
            continue;
        }
        const cityName = getCityDisplayName(cityId);
        if (label.text !== cityName) {
            label.text = cityName;
        }
        const centerX = (spawn.tileX + 1.5) * TILE;
        const centerY = (spawn.tileY + 1.5) * TILE;
        const visible = Math.abs(centerX - state.local.x) <= COMMAND_CENTER_LABEL_VIEW_THRESHOLD
            && Math.abs(centerY - state.local.y) <= COMMAND_CENTER_LABEL_VIEW_THRESHOLD;
        label.visible = visible;
        if (visible) {
            label.position.set(centerX, centerY + COMMAND_CENTER_LABEL_OFFSET_Y);
        }
    }
};

export const renderGhostPlacement = (state: ClientState, layers: SceneLayers): void => {
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

export const renderWorldObjects = (state: ClientState, layers: SceneLayers, viewBounds: WorldViewBounds): void => {
    const nowMs = Date.now();
    const animationCounter = Math.floor(nowMs / 100);
    syncWorldBuildingSprites(state, layers, viewBounds, animationCounter);
    syncWorldDefenseSprites(state, layers, viewBounds, nowMs);
    renderHazardItems(state, layers.objectLayer, layers.hazardSprites, layers.textures.items, viewBounds);
    syncWorldBulletSprites(state, layers, viewBounds, nowMs);
};
