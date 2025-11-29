"use strict";

const normalizeVector = (dx, dy) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return { dx: 0, dy: 0 };
    }
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq < 1e-6) {
        return { dx: 0, dy: 0 };
    }
    const length = Math.sqrt(lengthSq);
    return { dx: dx / length, dy: dy / length };
};

const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) {
        return fallback;
    }
    const lengthSq = (dx * dx) + (dy * dy);
    if (lengthSq < 1e-4) {
        return fallback;
    }
    const length = Math.sqrt(lengthSq);
    const normX = dx / length;
    const normY = dy / length;
    const theta = Math.atan2(-normX, -normY);
    let direction = Math.round((-theta / Math.PI) * 16);
    direction %= 32;
    if (direction < 0) {
        direction += 32;
    }
    return direction;
};

const directionToVector = (direction) => {
    if (!Number.isFinite(direction)) {
        return { dx: 0, dy: -1 };
    }
    const angle = (-direction / 16) * Math.PI;
    const dx = Math.sin(angle) * -1;
    const dy = Math.cos(angle) * -1;
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return { dx: 0, dy: -1 };
    }
    return { dx: dx / length, dy: dy / length };
};

const clampDelta = (delta) => {
    if (!Number.isFinite(delta)) {
        return 0;
    }
    return Math.max(0, Math.min(delta, 100));
};

const tryStep = (entity, vector, distance, isBlocked) => {
    if (!entity || !entity.offset || typeof isBlocked !== 'function') {
        return false;
    }
    const nextX = entity.offset.x + (vector.dx * distance);
    const nextY = entity.offset.y + (vector.dy * distance);
    if (isBlocked(nextX, nextY, entity)) {
        return false;
    }
    entity.offset.x = nextX;
    entity.offset.y = nextY;
    entity.lastSafeOffset = { x: nextX, y: nextY };
    return true;
};

const findAlternateVector = (entity, vector, distance, angles, isBlocked) => {
    if (!angles || !angles.length) {
        return null;
    }
    for (let i = 0; i < angles.length; i += 1) {
        const angle = angles[i];
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const alt = normalizeVector(
            (vector.dx * cos) - (vector.dy * sin),
            (vector.dx * sin) + (vector.dy * cos)
        );
        const nextX = entity.offset.x + (alt.dx * distance);
        const nextY = entity.offset.y + (alt.dy * distance);
        if (!isBlocked(nextX, nextY, entity)) {
            return alt;
        }
    }
    return null;
};

module.exports = {
    normalizeVector,
    vectorToDirection,
    directionToVector,
    clampDelta,
    tryStep,
    findAlternateVector,
};

