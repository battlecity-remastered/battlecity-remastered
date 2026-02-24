import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";

const TILE_SIZE = 48;

export const renderChangingLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    populationTexture: Texture | null = null,
    researchTexture: Texture | null = null,
    researchCompleteTexture: Texture | null = null,
    smokeTexture: Texture | null = null
): void => {
    sprite.clear();

    for (const building of state.buildings.values()) {
        if (building.population <= 0) {
            continue;
        }
        if (populationTexture) {
            const frame = Math.min(6, Math.floor((Math.max(0, Math.min(100, building.population)) / 100) * 6));
            const populationFrame = getFrameTexture(populationTexture, `population:${frame}`, frame * TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
            if (populationFrame) {
                sprite
                    .rect(building.tileX * TILE_SIZE, building.tileY * TILE_SIZE, TILE_SIZE, TILE_SIZE)
                    .fill({ texture: populationFrame, alpha: 0.88 });
                continue;
            }
        }
        const ratio = Math.max(0, Math.min(1, building.population / 100));
        const width = Math.floor(TILE_SIZE * ratio);
        sprite.rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4).fill(0x66f2a0);

        if (building.type === 200 || building.type === 201) {
            const cityResearch = state.research.get(building.cityId);
            const hasActiveResearch = Boolean(cityResearch?.active);
            const completedCount = cityResearch?.completed.length ?? 0;
            const researchFrame = hasActiveResearch
                ? getFrameTexture(researchTexture, "research:active", 0, 0, 10, 144)
                : completedCount > 0
                    ? getFrameTexture(researchCompleteTexture, "research:complete", 0, 0, 10, 144)
                    : null;
            if (researchFrame) {
                sprite
                    .rect((building.tileX * TILE_SIZE) + 40, building.tileY * TILE_SIZE, 6, TILE_SIZE)
                    .fill({ texture: researchFrame, alpha: 0.9 });
            }
        }
        if (building.type >= 100 && building.type <= 102 && smokeTexture) {
            const smokeFrame = Math.floor(Date.now() / 120) % 8;
            const smoke = getFrameTexture(smokeTexture, `smoke:${smokeFrame}`, 0, smokeFrame * 60, 180, 60);
            if (smoke) {
                sprite
                    .rect((building.tileX * TILE_SIZE) - 6, (building.tileY * TILE_SIZE) - 12, TILE_SIZE + 12, 20)
                    .fill({ texture: smoke, alpha: 0.6 });
            }
        }
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
