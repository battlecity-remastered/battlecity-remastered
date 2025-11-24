// Shared movement helpers for bot controllers (defenders, rogues)

export const normalizeVector = (dx, dy) => {
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return { dx: 0, dy: 0 };
    }
    return {
        dx: dx / length,
        dy: dy / length
    };
};

export const rotateVector = (vector, angle) => {
    if (!vector) {
        return { dx: 0, dy: 0 };
    }
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = (vector.dx * cos) - (vector.dy * sin);
    const dy = (vector.dx * sin) + (vector.dy * cos);
    return normalizeVector(dx, dy);
};

export const vectorToDirection = (dx, dy, fallback = 0) => {
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4)) {
        return fallback;
    }
    const length = Math.sqrt((dx * dx) + (dy * dy));
    if (length < 1e-4) {
        return fallback;
    }
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

export const directionToVector = (direction) => {
    const theta = (-direction / 16) * Math.PI;
    return {
        dx: Math.sin(theta),
        dy: Math.cos(theta)
    };
};

export const clampDelta = (timePassed, fallback = 16, max = 60) => {
    return Math.min(timePassed || fallback, max);
};

export const tryStep = (entity, vector, step, isBlocked) => {
    if (!vector || typeof isBlocked !== 'function') {
        return false;
    }
    const nextX = entity.offset.x + (vector.dx * step);
    const nextY = entity.offset.y + (vector.dy * step);
    if (isBlocked(nextX, nextY)) {
        return false;
    }
    entity.offset.x = nextX;
    entity.offset.y = nextY;
    entity.lastSafeOffset = { x: nextX, y: nextY };
    return true;
};

export const findAlternateVector = (entity, vector, step, avoidanceAngles, isBlocked) => {
    if (!vector || !Array.isArray(avoidanceAngles) || typeof isBlocked !== 'function') {
        return null;
    }
    for (let i = 0; i < avoidanceAngles.length; i += 1) {
        const rotated = rotateVector(vector, avoidanceAngles[i]);
        if (!rotated || (Math.abs(rotated.dx) < 1e-4 && Math.abs(rotated.dy) < 1e-4)) {
            continue;
        }
        const nextX = entity.offset.x + (rotated.dx * step);
        const nextY = entity.offset.y + (rotated.dy * step);
        if (!isBlocked(nextX, nextY)) {
            return rotated;
        }
    }
    return null;
};
