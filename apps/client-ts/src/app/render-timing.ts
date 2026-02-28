import type { ClientState } from "./state.js";

export const CLIENT_SIMULATION_STEP_MS = 33;
const MAX_EXTRAPOLATION_ALPHA = 1;
const MAX_VISUAL_STEP_DISTANCE_PX = 96;
const VISUAL_OFFSET_LERP_TIME_MS = 36;

const clampUnit = (value: number): number => {
    if (!Number.isFinite(value)) {
        return 0;
    }
    return Math.max(0, Math.min(MAX_EXTRAPOLATION_ALPHA, value));
};

export const captureLocalSimulationBase = (state: ClientState): void => {
    state.render.previousLocalX = state.local.x;
    state.render.previousLocalY = state.local.y;
};

export const resolveLocalRenderPosition = (
    state: ClientState,
    nowMs: number = Date.now()
): { x: number; y: number; } => {
    const movementInputActive = state.controls.moveForward || state.controls.moveBackward;
    if (!movementInputActive) {
        state.render.projectedOffsetX = 0;
        state.render.projectedOffsetY = 0;
        state.render.lastResolvedAt = nowMs;
        return { x: state.local.x, y: state.local.y };
    }

    const lastUpdateAt = state.debug.loop.lastUpdateAt;
    if (lastUpdateAt === null) {
        state.render.projectedOffsetX = 0;
        state.render.projectedOffsetY = 0;
        state.render.lastResolvedAt = nowMs;
        return { x: state.local.x, y: state.local.y };
    }

    const stepX = state.local.x - state.render.previousLocalX;
    const stepY = state.local.y - state.render.previousLocalY;
    const stepDistanceSquared = (stepX * stepX) + (stepY * stepY);
    if (stepDistanceSquared > (MAX_VISUAL_STEP_DISTANCE_PX ** 2)) {
        state.render.projectedOffsetX = 0;
        state.render.projectedOffsetY = 0;
        state.render.lastResolvedAt = nowMs;
        return { x: state.local.x, y: state.local.y };
    }

    const elapsedSinceUpdateMs = Math.max(0, nowMs - lastUpdateAt);
    const alpha = clampUnit(elapsedSinceUpdateMs / CLIENT_SIMULATION_STEP_MS);
    const targetOffsetX = stepX * alpha;
    const targetOffsetY = stepY * alpha;
    const previousResolvedAt = state.render.lastResolvedAt;
    if (previousResolvedAt === null) {
        state.render.projectedOffsetX = targetOffsetX;
        state.render.projectedOffsetY = targetOffsetY;
    } else {
        const dtMs = Math.max(0, nowMs - previousResolvedAt);
        const gain = 1 - Math.exp(-dtMs / VISUAL_OFFSET_LERP_TIME_MS);
        state.render.projectedOffsetX += (targetOffsetX - state.render.projectedOffsetX) * gain;
        state.render.projectedOffsetY += (targetOffsetY - state.render.projectedOffsetY) * gain;
    }
    state.render.lastResolvedAt = nowMs;

    return {
        x: state.local.x + state.render.projectedOffsetX,
        y: state.local.y + state.render.projectedOffsetY
    };
};

export const peekLocalRenderPosition = (state: ClientState): { x: number; y: number; } => {
    return {
        x: state.local.x + state.render.projectedOffsetX,
        y: state.local.y + state.render.projectedOffsetY
    };
};
