import { Text, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const FLOAT_POINTS_MS = 900;

const createFloatingPointsLabel = (): Text => {
    return new Text({
        text: "",
        style: {
            fontFamily: "Arial",
            fontSize: 15,
            fontWeight: "700",
            fill: 0xffd166,
            stroke: {
                color: 0x2a1a00,
                width: 3,
                join: "round"
            }
        }
    });
};

const removeFloatingPointsLabel = (
    layer: Container,
    floatingPointLabels: Map<string, Text>,
    pointsId: string
): void => {
    const label = floatingPointLabels.get(pointsId);
    if (!label) {
        return;
    }
    if (label.parent === layer) {
        layer.removeChild(label);
    }
    label.destroy();
    floatingPointLabels.delete(pointsId);
};

const formatFloatingPointsAmount = (amount: number): string => {
    if (!Number.isFinite(amount)) {
        return "0";
    }
    const rounded = Math.round(amount * 100) / 100;
    return Number.isInteger(rounded) ? `${rounded}` : rounded.toFixed(2).replace(/\.?0+$/, "");
};

export const renderFloatingPoints = (
    state: ClientState,
    nowMs: number,
    layer: Container,
    floatingPointLabels: Map<string, Text>
): void => {
    const activePointIds = new Set<string>();
    for (let i = state.events.effects.floatingPoints.length - 1; i >= 0; i -= 1) {
        const points = state.events.effects.floatingPoints[i];
        if (!points) {
            continue;
        }
        const age = nowMs - points.createdAt;
        if (age >= FLOAT_POINTS_MS) {
            state.events.effects.floatingPoints.splice(i, 1);
            removeFloatingPointsLabel(layer, floatingPointLabels, points.id);
            continue;
        }
        activePointIds.add(points.id);
        const t = age / FLOAT_POINTS_MS;
        const yOffset = Math.floor(28 * t);
        const alpha = Math.max(0, 1 - t);
        let label = floatingPointLabels.get(points.id);
        if (!label) {
            label = createFloatingPointsLabel();
            floatingPointLabels.set(points.id, label);
        }
        const text = formatFloatingPointsAmount(points.amount);
        if (label.text !== text) {
            label.text = text;
        }
        label.anchor.set(0.5, 1);
        label.position.set(points.x, points.y - 10 - yOffset);
        label.alpha = alpha;
        if (label.parent !== layer) {
            layer.addChild(label);
        }
    }
    for (const pointsId of floatingPointLabels.keys()) {
        if (activePointIds.has(pointsId)) {
            continue;
        }
        removeFloatingPointsLabel(layer, floatingPointLabels, pointsId);
    }
};
