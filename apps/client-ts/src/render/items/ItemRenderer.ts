import { Graphics, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";
import { reconcileEntityCache } from "../entity-cache.js";

const ITEM_TYPE_MINE = 1;

const resolveHazardSortKey = (type: number): number => {
    if (type === ITEM_TYPE_MINE) {
        return 10;
    }
    return 20;
};

const hazardColor = (type: number): number => {
    if (type === ITEM_TYPE_MINE) {
        return 0xf85d74;
    }
    return 0xffa95e;
};

const isHiddenEnemyMine = (state: ClientState, hazard: { cityId: number; type: number }): boolean => {
    return hazard.type === ITEM_TYPE_MINE && hazard.cityId !== state.local.city;
};

export const renderHazardItems = (
    state: ClientState,
    layer: Container,
    cache: Map<string, Graphics>
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
            const sprite = new Graphics();
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
        sprite.position.set(hazard.x, hazard.y);
        layer.setChildIndex(sprite, Math.min(layer.children.length - 1, resolveHazardSortKey(hazard.type)));
    }
};
