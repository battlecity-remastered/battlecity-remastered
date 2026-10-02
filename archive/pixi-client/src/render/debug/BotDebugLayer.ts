import { Graphics, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;
const PLAYER_SPRITE_SIZE = 48;
const PLAYER_SPRITE_HALF = PLAYER_SPRITE_SIZE / 2;

export const resolveDebugLocalLineTarget = (
    state: ClientState,
    localRenderX: number = state.local.x,
    localRenderY: number = state.local.y
): { x: number; y: number; } => {
    return {
        x: localRenderX + PLAYER_SPRITE_HALF,
        y: localRenderY + PLAYER_SPRITE_HALF
    };
};

export const renderBotDebugLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    localRenderX: number = state.local.x,
    localRenderY: number = state.local.y
): void => {
    sprite.clear();
    sprite.visible = state.ui.showBotDebug;
    if (!state.ui.showBotDebug) {
        return;
    }
    const localLineTarget = resolveDebugLocalLineTarget(state, localRenderX, localRenderY);

    for (const defense of state.defenses.values()) {
        sprite
            .rect(defense.tileX * TILE_SIZE, defense.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)
            .stroke({ color: 0x4ac0ff, width: 1, alpha: 0.8 });
        sprite
            .lineTo((defense.tileX * TILE_SIZE) + TILE_SIZE / 2, (defense.tileY * TILE_SIZE) + TILE_SIZE / 2)
            .lineTo(localLineTarget.x, localLineTarget.y)
            .stroke({ color: 0x4ac0ff, width: 1, alpha: 0.3 });
    }

    for (const hazard of state.hazards.values()) {
        sprite
            .circle(hazard.x, hazard.y, 6)
            .fill({ color: 0xff4d6d, alpha: 0.8 });
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
