const ORB_FRAME_COUNT = 3;
const ORB_FRAME_INTERVAL_MS = 200;

const clampFrameIndex = (value) => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    if (value < 0) {
        return 0;
    }
    if (value >= ORB_FRAME_COUNT) {
        return ORB_FRAME_COUNT - 1;
    }
    return value;
};

export const getOrbAnimationFrame = (game, options = {}) => {
    const timestamp = (game && Number.isFinite(game.tick)) ? game.tick : Date.now();
    const offset = Number.isFinite(options.phaseOffset) ? options.phaseOffset : 0;
    const cycleLength = ORB_FRAME_COUNT * ORB_FRAME_INTERVAL_MS;
    const normalized = ((timestamp + offset) % cycleLength + cycleLength) % cycleLength;
    const frame = Math.floor(normalized / ORB_FRAME_INTERVAL_MS);
    return clampFrameIndex(frame);
};

export const ORB_ANIMATION_INTERVAL_MS = ORB_FRAME_INTERVAL_MS;
export const ORB_ANIMATION_FRAME_COUNT = ORB_FRAME_COUNT;

export default getOrbAnimationFrame;
