import { Graphics, Text } from "pixi.js";
import type { ClientState } from "../app/state.js";
import { resolveViewportFromState } from "../gameplay/world-viewport.js";
import type { SceneLayers } from "./scene-layers.js";
import { getFrameTexture } from "./TextureRegistry.js";
import {
    HOME_ARROW,
    isPanelButtonActive,
    PANEL_BUTTONS,
    PANEL_BOTTOM_HEIGHT,
    PANEL_BOTTOM_Y,
    PANEL_FINANCE,
    PANEL_HEALTH,
    PANEL_INVENTORY_SLOTS,
    PANEL_MESSAGE,
    PANEL_TOP_HEIGHT,
    PANEL_TOP_Y,
    projectRadarPoint,
    RADAR_BOUNDS,
    resolveHealthMaskRect,
    resolveHomeArrowFrame
} from "./panel/panel-visuals.js";
import { resolveCitySpawn } from "../world/city-spawn.js";
import { isRefreshDue } from "./pacing.js";
import { ITEM_TYPE_BOMB, ITEM_TYPE_ORB, PANEL, TILE } from "./parity/constants.js";
import { resolvePanelItemFrameRect, resolvePanelMessage } from "./side-panel-model.js";

const SIDE_PANEL_REFRESH_MS = 33;
type SidePanelRenderContext = {
    state: ClientState;
    layers: SceneLayers;
    panelX: number;
    panelVisualHeight: number;
    nowMs: number;
};
type SidePanelRuntime = {
    lastRefreshAt: number | null;
};

const sidePanelRuntimeByBackground = new WeakMap<Graphics, SidePanelRuntime>();

const ensureSidePanelRuntime = (layers: SceneLayers): SidePanelRuntime => {
    const existing = sidePanelRuntimeByBackground.get(layers.panelBackground);
    if (existing) {
        return existing;
    }
    const created: SidePanelRuntime = {
        lastRefreshAt: null
    };
    sidePanelRuntimeByBackground.set(layers.panelBackground, created);
    return created;
};

const formatCash = (value: number): string => {
    const amount = Number.isFinite(value) ? Math.floor(value) : 0;
    try {
        return amount.toLocaleString("en-US");
    } catch {
        return `${amount}`;
    }
};

const setTextIfChanged = (target: Text, value: string): void => {
    if (target.text !== value) {
        target.text = value;
    }
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
    const cashFill = income < 0 ? 0xe74c3c : 0x2ecc71;
    if (layers.panelCashText.style.fill !== cashFill) {
        layers.panelCashText.style.fill = cashFill;
    }
    setTextIfChanged(layers.panelCashText, formatCash(cash));
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
                setTextIfChanged(countText, `${countValue}`);
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
    setTextIfChanged(context.layers.panelMessageHeading, panelMessage.heading);
    context.layers.panelMessageHeading.visible = panelMessage.heading.length > 0;
    setTextIfChanged(context.layers.panelMessageBody, panelMessage.lines.join("\n"));
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

export const renderSidePanel = (state: ClientState, layers: SceneLayers): void => {
    const context = createSidePanelRenderContext(state, layers);
    layoutSidePanelSprites(context);
    const runtime = ensureSidePanelRuntime(layers);
    if (!isRefreshDue(runtime.lastRefreshAt, context.nowMs, SIDE_PANEL_REFRESH_MS)) {
        return;
    }
    runtime.lastRefreshAt = context.nowMs;
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
