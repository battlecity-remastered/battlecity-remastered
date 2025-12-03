import PIXI from '../pixi.js';
import { scheduleDestroy } from '../utils/pixiPerformance.js';

const FLOAT_DURATION_MS = 900;
const FLOAT_DISTANCE_PX = 32;
const MAX_ACTIVE_FLOATS = 24;

const createFloatingText = (value) => {
    const label = new PIXI.Text({
        text: `+${value}`,
        style: {
            fontFamily: 'Arial',
            fontSize: 16,
            fontWeight: '900',
            fill: 0xFFD166,
            stroke: { color: 0x0c1020, width: 4 },
            dropShadow: true,
            dropShadowColor: '#0c1020',
            dropShadowDistance: 2
        }
    });
    label.anchor.set(0.5, 1);
    return label;
};

export const addFloatingPoints = (game, { amount, x, y }) => {
    if (!game) {
        return;
    }
    const points = Number(amount);
    const posX = Number(x);
    const posY = Number(y);
    if (!Number.isFinite(points) || points <= 0 || !Number.isFinite(posX) || !Number.isFinite(posY)) {
        return;
    }
    if (!Array.isArray(game.floatingPoints)) {
        game.floatingPoints = [];
    }
    const now = game.tick || Date.now();
    const entry = {
        id: `${now}:${Math.random()}`,
        amount: Math.round(points),
        x: posX,
        y: posY,
        createdAt: now,
        duration: FLOAT_DURATION_MS,
        sprite: null
    };
    game.floatingPoints.push(entry);
    if (game.floatingPoints.length > MAX_ACTIVE_FLOATS) {
        const removed = game.floatingPoints.shift();
        if (removed?.sprite) {
            scheduleDestroy(removed.sprite, { minDelay: 0, maxDelay: 120 });
        }
    }
};

export const drawFloatingPoints = (game, stage) => {
    if (!game || !Array.isArray(game.floatingPoints) || !stage) {
        return;
    }
    const now = game.tick || Date.now();
    const cameraX = Number(game.player?.offset?.x) || 0;
    const cameraY = Number(game.player?.offset?.y) || 0;
    const screenCenterX = Number(game.player?.defaultOffset?.x) || 0;
    const screenCenterY = Number(game.player?.defaultOffset?.y) || 0;

    for (let i = game.floatingPoints.length - 1; i >= 0; i--) {
        const entry = game.floatingPoints[i];
        if (!entry) {
            game.floatingPoints.splice(i, 1);
            continue;
        }
        const elapsed = Math.max(0, now - entry.createdAt);
        const t = Math.min(1, elapsed / entry.duration);
        const lift = FLOAT_DISTANCE_PX * t;
        const alpha = Math.max(0, 1 - t);
        if (!entry.sprite) {
            entry.sprite = createFloatingText(entry.amount);
        }
        const screenX = entry.x + (screenCenterX - cameraX);
        const screenY = entry.y + (screenCenterY - cameraY) - lift;
        entry.sprite.x = screenX;
        entry.sprite.y = screenY;
        entry.sprite.alpha = alpha;
        stage.addChild(entry.sprite);

        if (elapsed >= entry.duration) {
            if (entry.sprite?.parent) {
                entry.sprite.parent.removeChild(entry.sprite);
            }
            scheduleDestroy(entry.sprite, { minDelay: 16, maxDelay: 180 });
            game.floatingPoints.splice(i, 1);
        }
    }
};
