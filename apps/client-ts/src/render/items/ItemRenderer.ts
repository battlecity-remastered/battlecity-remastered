import { Graphics, Sprite, type Container, type Texture } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { reconcileEntityCache } from "../entity-cache.js";
import { getFrameTexture } from "../LegacyTextureRegistry.js";
import {
    ITEM_TYPE_BOMB,
    ITEM_TYPE_MINE
} from "../parity/constants.js";
import {
    resolveHazardFrameRect,
    resolveHazardOffset,
    resolveHazardSortKey
} from "./item-parity-helpers.js";

const hazardColor = (type: number): number => {
    if (type === ITEM_TYPE_MINE) {
        return 0xf85d74;
    }
    return 0xffa95e;
};

const isHiddenEnemyMine = (
    state: ClientState,
    hazard: { cityId: number; type: number; armed?: boolean; }
): boolean => {
    return hazard.type === ITEM_TYPE_MINE
        && hazard.cityId !== state.local.city
        && hazard.armed !== false;
};

export const renderHazardItems = (
    state: ClientState,
    layer: Container,
    cache: Map<string, Graphics | Sprite>,
    itemTexture: Texture | null = null
): void => {
    const visibleHazardIds = [...state.hazards.values()]
        .filter((hazard) => !isHiddenEnemyMine(state, hazard))
        .sort((left, right) => {
            const leftKey = resolveHazardSortKey(left.type);
            const rightKey = resolveHazardSortKey(right.type);
            if (leftKey !== rightKey) {
                return leftKey - rightKey;
            }
            return left.id.localeCompare(right.id);
        })
        .map((hazard) => hazard.id);

    reconcileEntityCache(
        cache,
        visibleHazardIds,
        () => {
            const sprite = itemTexture ? new Sprite() : new Graphics();
            if (sprite instanceof Sprite) {
                sprite.anchor.set(0, 0);
            }
            layer.addChild(sprite);
            return sprite;
        },
        (_id, sprite) => {
            layer.removeChild(sprite);
            sprite.destroy();
        }
    );

    for (const hazardId of visibleHazardIds) {
        const hazard = state.hazards.get(hazardId);
        const sprite = cache.get(hazardId);
        if (!hazard || !sprite) {
            continue;
        }

        if (sprite instanceof Sprite && itemTexture) {
            const isMine = hazard.type === ITEM_TYPE_MINE;
            const isBomb = hazard.type === ITEM_TYPE_BOMB;
            const animation = Math.floor(Date.now() / 120) % 4;
            const bombArmed = isBomb && hazard.armed === true;
            const rect = resolveHazardFrameRect(hazard.type, animation, bombArmed);
            const frame = getFrameTexture(
                itemTexture,
                `hazard:${hazard.type}:${animation}:${bombArmed ? 1 : 0}`,
                rect.x,
                rect.y,
                rect.width,
                rect.height
            );
            if (frame) {
                sprite.texture = frame;
                sprite.scale.set(1, 1);
                sprite.alpha = isMine ? 0.86 : 0.9;
            }
            const offset = resolveHazardOffset(hazard.type);
            sprite.position.set(hazard.x + offset.x, hazard.y + offset.y);
        } else if (sprite instanceof Graphics) {
            sprite.clear();
            sprite
                .circle(0, 0, Math.max(4, Math.min(24, hazard.radius / 4)))
                .fill({
                    color: hazardColor(hazard.type),
                    alpha: 0.55
                })
                .stroke({
                    color: 0xfff2cc,
                    width: 1,
                    alpha: 0.8
                });
        }
        if (sprite instanceof Graphics) {
            sprite.position.set(hazard.x, hazard.y);
        }
        layer.setChildIndex(sprite, Math.min(layer.children.length - 1, resolveHazardSortKey(hazard.type)));
    }
};
