import { Graphics, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const TILE_SIZE = 48;

export const renderChangingLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics
): void => {
    sprite.clear();

    for (const building of state.buildings.values()) {
        if (building.population <= 0) {
            continue;
        }
        const ratio = Math.max(0, Math.min(1, building.population / 100));
        const width = Math.floor(TILE_SIZE * ratio);
        sprite
            .rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4)
            .fill(0x66f2a0);
    }

    for (const defense of state.defenses.values()) {
        const ratio = Math.max(0, Math.min(1, defense.health / Math.max(1, defense.maxHealth)));
        const width = Math.floor(TILE_SIZE * ratio);
        sprite
            .rect(defense.tileX * TILE_SIZE, (defense.tileY * TILE_SIZE) - 2, width, 2)
            .fill(0xffd68a);
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }
};
