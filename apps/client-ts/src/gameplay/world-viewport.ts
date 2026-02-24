import type { ClientState } from "../app/state.js";

export const TILE_SIZE = 48;
export const PANEL_WIDTH = 200;
export const WORLD_MAX = 24576;

export type WorldViewport = {
    surfaceWidth: number;
    surfaceHeight: number;
    worldWidth: number;
    worldHeight: number;
    centerX: number;
    centerY: number;
    panelStartX: number;
};

const fallbackSurfaceWidth = (): number => {
    if (typeof window !== "undefined" && Number.isFinite(window.innerWidth)) {
        return Math.max(1, Math.floor(window.innerWidth));
    }
    return 1024;
};

const fallbackSurfaceHeight = (): number => {
    if (typeof window !== "undefined" && Number.isFinite(window.innerHeight)) {
        return Math.max(1, Math.floor(window.innerHeight));
    }
    return 768;
};

const toPositiveInt = (value: number, fallback: number): number => {
    if (!Number.isFinite(value) || value <= 0) {
        return fallback;
    }
    return Math.max(1, Math.floor(value));
};

export const resolveWorldViewport = (
    surfaceWidth: number,
    surfaceHeight: number
): WorldViewport => {
    const width = toPositiveInt(surfaceWidth, fallbackSurfaceWidth());
    const height = toPositiveInt(surfaceHeight, fallbackSurfaceHeight());
    const worldWidth = Math.max(1, width - PANEL_WIDTH);
    const worldHeight = height;
    return {
        surfaceWidth: width,
        surfaceHeight: height,
        worldWidth,
        worldHeight,
        centerX: worldWidth / 2,
        centerY: worldHeight / 2,
        panelStartX: worldWidth
    };
};

export const resolveViewportFromState = (state: ClientState): WorldViewport => {
    return resolveWorldViewport(state.pointer.surfaceWidth, state.pointer.surfaceHeight);
};

export type PointerWorldPosition = {
    x: number;
    y: number;
    insideWorld: boolean;
};

export const resolvePointerWorldPosition = (state: ClientState): PointerWorldPosition => {
    const viewport = resolveViewportFromState(state);
    const insideWorld = state.pointer.inside
        && state.pointer.x >= 0
        && state.pointer.y >= 0
        && state.pointer.x < viewport.panelStartX
        && state.pointer.y <= viewport.surfaceHeight;
    return {
        x: state.local.x + (state.pointer.x - viewport.centerX),
        y: state.local.y + (state.pointer.y - viewport.centerY),
        insideWorld
    };
};

export type PointerWorldTile = {
    tileX: number;
    tileY: number;
    x: number;
    y: number;
};

export const resolvePointerWorldTile = (state: ClientState): PointerWorldTile | null => {
    const world = resolvePointerWorldPosition(state);
    if (!world.insideWorld) {
        return null;
    }
    return {
        tileX: Math.floor(world.x / TILE_SIZE),
        tileY: Math.floor(world.y / TILE_SIZE),
        x: world.x,
        y: world.y
    };
};
