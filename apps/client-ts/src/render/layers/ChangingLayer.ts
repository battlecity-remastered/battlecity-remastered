import { Graphics, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import {
    isCommandCenterType,
    isFactoryType,
    resolveFactoryDigits,
    resolvePopulationFrame,
    resolvePopulationOffset,
    resolveResearchStripPlacement,
    resolveSmokeFrame,
    resolveSmokePlacement
} from "./changing-layer-helpers.js";

const TILE_SIZE = 48;

export const renderChangingLayer = (
    state: ClientState,
    layer: Container,
    sprite: Graphics,
    populationTexture: Texture | null = null,
    researchTexture: Texture | null = null,
    researchCompleteTexture: Texture | null = null,
    smokeTexture: Texture | null = null,
    blackNumbersTexture: Texture | null = null,
    nowMs: number = Date.now()
): void => {
    sprite.clear();

    for (const building of state.buildings.values()) {
        if (building.population > 0) {
            const frame = resolvePopulationFrame(building.type, building.population);
            const offset = resolvePopulationOffset(building.type);
            if (populationTexture) {
                const populationFrame = getFrameTexture(
                    populationTexture,
                    `population:${frame.row}:${frame.column}`,
                    frame.column * TILE_SIZE,
                    frame.row * TILE_SIZE,
                    TILE_SIZE,
                    TILE_SIZE
                );
                if (populationFrame) {
                    sprite
                        .rect((building.tileX * TILE_SIZE) + offset.x, (building.tileY * TILE_SIZE) + offset.y, TILE_SIZE, TILE_SIZE)
                        .fill({ texture: populationFrame, alpha: 0.88 });
                } else {
                    const ratio = Math.max(0, Math.min(1, frame.column / 6));
                    const width = Math.floor(TILE_SIZE * ratio);
                    sprite.rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4).fill(0x66f2a0);
                }
            } else {
                const ratio = Math.max(0, Math.min(1, frame.column / 6));
                const width = Math.floor(TILE_SIZE * ratio);
                sprite.rect(building.tileX * TILE_SIZE, (building.tileY * TILE_SIZE) - 6, width, 4).fill(0x66f2a0);
            }
        }

        if (isCommandCenterType(building.type)) {
            const cityResearch = state.research.get(building.cityId);
            const hasActiveResearch = Boolean(cityResearch?.active);
            const completedCount = cityResearch?.completed.length ?? 0;
            const researchFrame = hasActiveResearch
                ? getFrameTexture(researchTexture, "research:active", 0, 5, 10, 134)
                : completedCount > 0
                    ? getFrameTexture(researchCompleteTexture, "research:complete", 0, 5, 10, 134)
                    : null;
            if (researchFrame) {
                const placement = resolveResearchStripPlacement(building.tileX, building.tileY);
                sprite
                    .rect(placement.x, placement.y, placement.width, placement.height)
                    .fill({ texture: researchFrame, alpha: 0.9 });
            }
        }
        if (isFactoryType(building.type) && smokeTexture) {
            const smokeFrame = resolveSmokeFrame(nowMs);
            const smoke = getFrameTexture(smokeTexture, `smoke:${smokeFrame}`, 0, smokeFrame * 60, 180, 60);
            if (smoke) {
                const placement = resolveSmokePlacement(building.tileX, building.tileY);
                sprite
                    .rect(placement.x, placement.y, placement.width, placement.height)
                    .fill({ texture: smoke, alpha: 0.6 });
            }

            if (blackNumbersTexture) {
                const stock = state.factoryStock.get(building.cityId);
                let total = 0;
                if (stock) {
                    for (const value of stock.values()) {
                        total += value;
                    }
                }
                const digits = resolveFactoryDigits(total);
                const tensFrame = getFrameTexture(blackNumbersTexture, `factory:tens:${digits.tens}`, digits.tens * 16, 0, 16, 16);
                const onesFrame = getFrameTexture(blackNumbersTexture, `factory:ones:${digits.ones}`, digits.ones * 16, 0, 16, 16);
                if (tensFrame) {
                    sprite
                        .rect((building.tileX * TILE_SIZE) + digits.tensOffset.x, (building.tileY * TILE_SIZE) + digits.tensOffset.y, 16, 16)
                        .fill({ texture: tensFrame, alpha: 0.95 });
                }
                if (onesFrame) {
                    sprite
                        .rect((building.tileX * TILE_SIZE) + digits.onesOffset.x, (building.tileY * TILE_SIZE) + digits.onesOffset.y, 16, 16)
                        .fill({ texture: onesFrame, alpha: 0.95 });
                }
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
