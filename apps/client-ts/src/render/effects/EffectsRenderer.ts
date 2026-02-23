import { Graphics, type Container } from "pixi.js";
import type { ClientState } from "../../app/state.js";

const MUZZLE_FLASH_MS = 120;
const SHAKE_MS = 150;

export const renderEffects = (
    state: ClientState,
    nowMs: number,
    stage: Container,
    layer: Container,
    sprite: Graphics
): void => {
    sprite.clear();
    const shotAge = nowMs - state.local.lastShotAt;

    if (shotAge >= 0 && shotAge < MUZZLE_FLASH_MS) {
        sprite
            .circle(state.local.x + 12, state.local.y, 7)
            .fill({ color: 0xffd166, alpha: 0.85 });
    }

    if (state.events.lastOrbedCityId !== null) {
        sprite
            .rect(state.local.x - 120, state.local.y - 90, 240, 180)
            .stroke({ color: 0xff6b6b, width: 2, alpha: 0.7 });
    }

    if (!layer.children.includes(sprite)) {
        layer.addChild(sprite);
    }

    if (shotAge >= 0 && shotAge < SHAKE_MS) {
        stage.position.set(
            Math.round((Math.random() - 0.5) * 4),
            Math.round((Math.random() - 0.5) * 4)
        );
        return;
    }
    stage.position.set(0, 0);
};
