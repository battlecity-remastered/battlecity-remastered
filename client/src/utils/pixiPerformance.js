import PIXI from '../pixi';

const DEFAULT_MIN_DELAY_MS = 0;
const DEFAULT_MAX_DELAY_MS = 180;

const resolveDelay = (minDelay = DEFAULT_MIN_DELAY_MS, maxDelay = DEFAULT_MAX_DELAY_MS) => {
    const safeMin = Math.max(0, Number.isFinite(minDelay) ? minDelay : DEFAULT_MIN_DELAY_MS);
    const safeMax = Math.max(safeMin, Number.isFinite(maxDelay) ? maxDelay : DEFAULT_MAX_DELAY_MS);
    if (safeMax === 0) {
        return 0;
    }
    if (safeMax === safeMin) {
        return safeMax;
    }
    return safeMin + Math.floor(Math.random() * (safeMax - safeMin));
};

export const scheduleDestroy = (displayObject, options = {}) => {
    if (!displayObject || typeof displayObject.destroy !== 'function') {
        return;
    }

    const {
        minDelay = DEFAULT_MIN_DELAY_MS,
        maxDelay = DEFAULT_MAX_DELAY_MS,
        destroyChildren = false,
        destroyTexture = false,
        destroyBaseTexture = false
    } = options;

    const runDestroy = () => {
        try {
            displayObject.destroy({
                children: destroyChildren,
                texture: destroyTexture,
                source: destroyBaseTexture // PixiJS v8: baseTexture -> source
            });
        } catch (error) {
            if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
                console.warn('Failed to destroy display object', error);
            }
        }
    };

    const delay = resolveDelay(minDelay, maxDelay);
    if (delay <= 0 || typeof setTimeout !== 'function') {
        runDestroy();
        return;
    }

    setTimeout(runDestroy, delay);
};

export const configureBatchingForSprite = (sprite) => {
    if (!sprite) {
        return;
    }
    if (sprite instanceof PIXI.Sprite) {
        sprite.roundPixels = true;
    }
};
